import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PassThrough } from 'stream';
import Docker from 'dockerode';
import { CircuitState } from '@prisma/client';
import { DockerConnectionsService } from './docker-connections.service';
import { DockerClientFactory } from './docker-client.factory';
import { DockerContainerOpsService } from './docker-container-ops.service';
import { DockerImageService } from './docker-image.service';

@Injectable()
export class DockerApiService {
  private readonly logger = new Logger(DockerApiService.name);

  constructor(
    private readonly dockerConnections: DockerConnectionsService,
    private readonly clientFactory: DockerClientFactory,
    private readonly containerOpsService: DockerContainerOpsService,
    private readonly imageService: DockerImageService,
  ) {}

  private async withNetworkErrorHandling<T>(
    operation: string,
    serverId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw wrapIfNetworkError(error, operation, serverId);
    }
  }

  async getClient(serverId: string): Promise<Docker> {
    const conn = await this.dockerConnections.findForServer(serverId);

    if (conn.circuitState === CircuitState.OPEN) {
      throw new ServiceUnavailableException(
        `Serveur Docker injoignable (circuit ouvert) pour le serveur ${serverId}, réessayez plus tard.`,
      );
    }

    return this.clientFactory.getOrCreate(
      serverId,
      conn.endpoint,
      conn.updatedAt,
    );
  }

  async inspectImage(
    serverId: string,
    imageRef: string,
  ): Promise<Docker.ImageInspectInfo | null> {
    const client = await this.getClient(serverId);
    return this.imageService.inspectImage(client, imageRef);
  }

  async inspectContainer(
    serverId: string,
    containerName: string,
  ): Promise<Docker.ContainerInspectInfo> {
    return this.withNetworkErrorHandling(
      'inspectContainer',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        return this.containerOpsService.inspectContainer(client, containerName);
      },
    );
  }

  async *streamContainerLogs(
    serverId: string,
    containerName: string,
    options: { follow?: boolean; tail?: number; since?: number } = {},
  ): AsyncIterable<{ stream: 'stdout' | 'stderr'; line: string }> {
    let stream: AsyncIterable<Buffer>;
    try {
      const client = await this.getClient(serverId);
      const container = client.getContainer(containerName);
      const follow = options.follow ?? true;
      stream = (await (follow
        ? container.logs({
            follow: true,
            stdout: true,
            stderr: true,
            tail: options.tail ?? 100,
            ...(options.since !== undefined ? { since: options.since } : {}),
          })
        : container.logs({
            follow: false,
            stdout: true,
            stderr: true,
            tail: options.tail ?? 100,
            ...(options.since !== undefined ? { since: options.since } : {}),
          }))) as unknown as AsyncIterable<Buffer>;
    } catch (error) {
      throw wrapIfNetworkError(error, 'streamContainerLogs', serverId);
    }

    try {
      for await (const chunk of stream) {
        yield* parseDockerStreamChunk(chunk);
      }
    } catch (error) {
      throw wrapIfNetworkError(error, 'streamContainerLogs', serverId);
    }
  }

  async getContainerStats(
    serverId: string,
    containerName: string,
  ): Promise<unknown> {
    return this.withNetworkErrorHandling(
      'getContainerStats',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        return client.getContainer(containerName).stats({ stream: false });
      },
    );
  }

  async listContainers(
    serverId: string,
    all = false,
  ): Promise<Docker.ContainerInfo[]> {
    return this.withNetworkErrorHandling(
      'listContainers',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        return this.containerOpsService.listContainers(client, all);
      },
    );
  }

  async createContainer(
    serverId: string,
    spec: Docker.ContainerCreateOptions,
  ): Promise<Docker.Container> {
    return this.withNetworkErrorHandling(
      'createContainer',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        return this.containerOpsService.createContainer(client, spec);
      },
    );
  }

  async startContainer(serverId: string, containerName: string): Promise<void> {
    await this.withNetworkErrorHandling(
      'startContainer',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        await this.containerOpsService.startContainer(client, containerName);
      },
    );
  }

  async connectNetwork(
    serverId: string,
    network: string,
    containerName: string,
  ): Promise<void> {
    const client = await this.getClient(serverId);
    await this.containerOpsService.connectNetwork(
      client,
      network,
      containerName,
    );
  }

  async stopContainer(
    serverId: string,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await this.withNetworkErrorHandling('stopContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      await this.containerOpsService.stopContainer(
        client,
        containerName,
        timeoutSec,
      );
    });
  }

  async restartContainer(
    serverId: string,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await this.withNetworkErrorHandling(
      'restartContainer',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        await this.containerOpsService.restartContainer(
          client,
          containerName,
          timeoutSec,
        );
      },
    );
  }

  async removeContainer(
    serverId: string,
    containerName: string,
    force = false,
  ): Promise<void> {
    await this.withNetworkErrorHandling(
      'removeContainer',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        await this.containerOpsService.removeContainer(
          client,
          containerName,
          force,
        );
      },
    );
  }

  async execCapture(
    serverId: string,
    containerName: string,
    cmd: string[],
  ): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
    return this.withNetworkErrorHandling('execCapture', serverId, async () => {
      const client = await this.getClient(serverId);
      const container = client.getContainer(containerName);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({});

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const out = new PassThrough();
      const err = new PassThrough();
      out.on('data', (c: Buffer) => stdoutChunks.push(c));
      err.on('data', (c: Buffer) => stderrChunks.push(c));
      client.modem.demuxStream(stream, out, err);

      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      out.end();
      err.end();

      const info = await exec.inspect();
      return {
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode: info.ExitCode ?? 0,
      };
    });
  }

  async execWithInput(
    serverId: string,
    containerName: string,
    cmd: string[],
    input: Buffer,
  ): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
    return this.withNetworkErrorHandling(
      'execWithInput',
      serverId,
      async () => {
        const client = await this.getClient(serverId);
        const container = client.getContainer(containerName);
        const exec = await container.exec({
          Cmd: cmd,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
        });
        const stream = await exec.start({ hijack: true, stdin: true });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        const out = new PassThrough();
        const err = new PassThrough();
        out.on('data', (c: Buffer) => stdoutChunks.push(c));
        err.on('data', (c: Buffer) => stderrChunks.push(c));
        client.modem.demuxStream(stream, out, err);

        stream.write(input);
        stream.end();

        await new Promise<void>((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });
        out.end();
        err.end();

        const info = await exec.inspect();
        return {
          stdout: Buffer.concat(stdoutChunks),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
          exitCode: info.ExitCode ?? 0,
        };
      },
    );
  }

  async buildImage(
    serverId: string,
    context: { src: string[]; dockerfile: string } | string,
    opts: { tag?: string; remote?: string } = {},
  ): Promise<string> {
    const client = await this.getClient(serverId);
    return this.imageService.buildImage(client, serverId, context, opts);
  }

  async pullImage(
    serverId: string,
    imageRef: string,
    auth?: { username: string; password: string; serveraddress?: string },
  ): Promise<void> {
    const client = await this.getClient(serverId);
    await this.imageService.pullImage(client, serverId, imageRef, auth);
  }

  async pruneDanglingImages(serverId: string): Promise<void> {
    const client = await this.getClient(serverId);
    await this.imageService.pruneDanglingImages(client, serverId);
  }

  async createVolume(serverId: string, name: string): Promise<void> {
    await this.withNetworkErrorHandling('createVolume', serverId, async () => {
      const client = await this.getClient(serverId);
      await client.createVolume({ Name: name });
      this.logger.log(`Volume created: ${name}`);
    });
  }

  async removeVolume(serverId: string, name: string): Promise<void> {
    await this.withNetworkErrorHandling('removeVolume', serverId, async () => {
      const client = await this.getClient(serverId);
      const volume = client.getVolume(name);
      await volume.remove();
      this.logger.log(`Volume removed: ${name}`);
    });
  }

  async createNetwork(serverId: string, name: string): Promise<void> {
    const client = await this.getClient(serverId);
    try {
      await client.createNetwork({
        Name: name,
        Driver: 'bridge',
        CheckDuplicate: true,
      });
      this.logger.log(`Network created: ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('already exists') || msg.includes('409')) {
        return;
      }
      throw err;
    }
  }

  invalidateCache(serverId: string): void {
    this.clientFactory.invalidateCache(serverId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
]);

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const message = (error as { message?: string }).message;
  if (typeof message !== 'string') return false;
  return /ECONNREFUSED|ETIMEDOUT|ECONNRESET|socket hang up|EHOSTUNREACH|ENETUNREACH/i.test(
    message,
  );
}

function wrapIfNetworkError(
  error: unknown,
  operation: string,
  serverId: string,
): unknown {
  if (!isNetworkError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `Connexion au daemon Docker perdue pendant ${operation} (serveur ${serverId}): ${message}`,
  );
}

function* parseDockerStreamChunk(
  chunk: Buffer,
): Generator<{ stream: 'stdout' | 'stderr'; line: string }> {
  let offset = 0;
  while (offset < chunk.length) {
    if (offset + 8 > chunk.length) break;
    const streamType = chunk[offset];
    const size = chunk.readUInt32BE(offset + 4);
    if (offset + 8 + size > chunk.length) break;
    const payload = chunk.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size;
    const stream: 'stdout' | 'stderr' = streamType === 2 ? 'stderr' : 'stdout';
    for (const rawLine of payload.toString('utf8').split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line.length > 0) yield { stream, line };
    }
  }
}
