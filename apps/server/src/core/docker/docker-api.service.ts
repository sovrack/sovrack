import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Docker from 'dockerode';
import { DockerConnectionsService } from './docker-connections.service';

type DecryptedDockerTls = {
  ca: string;
  cert: string;
  key: string;
  endpoint: string;
};

/**
 * Unified Docker Engine API client over TLS.
 *
 * Provides structured access to Docker daemon operations (inspect, logs,
 * stats, lifecycle) for any server that has a DockerConnection configured.
 * Used by containers/, deployments/, and monitoring/ modules.
 *
 * Why TLS over SSH shell-outs:
 *  - No shell injection risk on image refs
 *  - Structured JSON responses (no text parsing)
 *  - Single TLS handshake cached per server, not a new SSH process per call
 */
@Injectable()
export class DockerApiService {
  private readonly logger = new Logger(DockerApiService.name);
  private readonly clientCache = new Map<string, { client: Docker; endpoint: string }>();

  constructor(private readonly dockerConnections: DockerConnectionsService) {}

  async getClient(serverId: string): Promise<Docker> {
    const conn = await this.dockerConnections.findForServer(serverId);
    const cacheKey = `${serverId}:${conn.endpoint}`;
    const cached = this.clientCache.get(cacheKey);
    if (cached) return cached.client;

    const tls = await this.dockerConnections.getDecryptedTls(serverId);
    const client = this.buildClient(conn.endpoint, tls);
    this.clientCache.set(cacheKey, { client, endpoint: conn.endpoint });
    this.logger.log(`Docker client initialized for server ${serverId} at ${conn.endpoint}`);
    return client;
  }

  async inspectImage(serverId: string, imageRef: string): Promise<Docker.ImageInspectInfo | null> {
    const client = await this.getClient(serverId);
    try {
      return await client.getImage(imageRef).inspect();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async inspectContainer(serverId: string, containerName: string): Promise<Docker.ContainerInspectInfo> {
    const client = await this.getClient(serverId);
    return client.getContainer(containerName).inspect();
  }

  async *streamContainerLogs(
    serverId: string,
    containerName: string,
    options: { follow?: boolean; tail?: number; since?: number } = {},
  ): AsyncIterable<{ stream: 'stdout' | 'stderr'; line: string }> {
    const client = await this.getClient(serverId);
    const container = client.getContainer(containerName);
    const follow = options.follow ?? true;
    const stream = (await (follow
      ? container.logs({ follow: true, stdout: true, stderr: true, tail: options.tail ?? 100, ...(options.since !== undefined ? { since: options.since } : {}) })
      : container.logs({ follow: false, stdout: true, stderr: true, tail: options.tail ?? 100, ...(options.since !== undefined ? { since: options.since } : {}) })
    )) as unknown as AsyncIterable<Buffer>;

    for await (const chunk of stream) {
      yield* parseDockerStreamChunk(chunk);
    }
  }

  async getContainerStats(serverId: string, containerName: string): Promise<unknown> {
    const client = await this.getClient(serverId);
    return client.getContainer(containerName).stats({ stream: false });
  }

  async listContainers(serverId: string, all = false): Promise<Docker.ContainerInfo[]> {
    const client = await this.getClient(serverId);
    return client.listContainers({ all });
  }

  async startContainer(serverId: string, containerName: string): Promise<void> {
    const client = await this.getClient(serverId);
    await client.getContainer(containerName).start();
  }

  async stopContainer(serverId: string, containerName: string, timeoutSec = 10): Promise<void> {
    const client = await this.getClient(serverId);
    await client.getContainer(containerName).stop({ t: timeoutSec });
  }

  async restartContainer(serverId: string, containerName: string, timeoutSec = 10): Promise<void> {
    const client = await this.getClient(serverId);
    await client.getContainer(containerName).restart({ t: timeoutSec });
  }

  async removeContainer(serverId: string, containerName: string, force = false): Promise<void> {
    const client = await this.getClient(serverId);
    await client.getContainer(containerName).remove({ force });
  }

  invalidateCache(serverId: string): void {
    for (const key of this.clientCache.keys()) {
      if (key.startsWith(`${serverId}:`)) {
        this.clientCache.delete(key);
        this.logger.log(`Evicted Docker client cache for server ${serverId}`);
      }
    }
  }

  private buildClient(endpoint: string, tls: DecryptedDockerTls | null): Docker {
    const url = new URL(endpoint);
    const options: Docker.DockerOptions = {
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      protocol: url.protocol === 'https:' ? 'https' : 'http',
    };
    if (tls && (tls.ca || tls.cert || tls.key)) {
      if (tls.ca) options.ca = tls.ca;
      if (tls.cert) options.cert = tls.cert;
      if (tls.key) options.key = tls.key;
    } else if (url.protocol === 'https:') {
      throw new Error(
        `Docker endpoint ${endpoint} is https:// but no TLS material is configured.`,
      );
    }
    return new Docker(options);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode === 404) return true;
  const message = (error as { message?: string }).message;
  if (typeof message !== 'string') return false;
  return /not found|no such image|image not found/i.test(message);
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
