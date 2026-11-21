import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Docker from 'dockerode';

interface DockerStreamApi {
  buildImage(
    context: unknown,
    opts: Record<string, unknown>,
  ): Promise<NodeJS.ReadableStream>;
  pull(
    ref: string,
    opts: Record<string, unknown>,
  ): Promise<NodeJS.ReadableStream>;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode === 404) return true;
  const message = (error as { message?: string }).message;
  if (typeof message !== 'string') return false;
  return /not found|no such image|image not found/i.test(message);
}

@Injectable()
export class DockerImageService {
  private readonly logger = new Logger(DockerImageService.name);

  constructor(private readonly configService: ConfigService) {}

  async inspectImage(
    client: Docker,
    imageRef: string,
  ): Promise<Docker.ImageInspectInfo | null> {
    try {
      return await client.getImage(imageRef).inspect();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async buildImage(
    client: Docker,
    serverId: string,
    context: { src: string[]; dockerfile: string } | string,
    opts: { tag?: string; remote?: string } = {},
  ): Promise<string> {
    const timeoutMs = this.getTimeoutMs('DOCKER_BUILD_TIMEOUT_MS', 900_000);
    const result = await this.withTimeout(
      `buildImage (serveur ${serverId})`,
      timeoutMs,
      async (controller) => {
        const stream = await (client as unknown as DockerStreamApi).buildImage(
          context,
          {
            t: opts.tag,
            remote: opts.remote,
            dockerfile:
              typeof context === 'object' ? context.dockerfile : undefined,
          },
        );
        const onAbort = () => {
          (stream as unknown as { destroy?: () => void }).destroy?.();
        };
        controller.signal.addEventListener('abort', onAbort);
        try {
          return await new Promise<string>((resolve, reject) => {
            client.modem.followProgress(stream, (err, res) => {
              if (err) return reject(err);
              const events = (res ?? []) as Array<{ aux?: { ID?: string } }>;
              const last =
                events.length > 0 ? events[events.length - 1] : undefined;
              const imageId = last?.aux?.ID ?? opts.tag ?? 'unknown';
              resolve(imageId);
            });
          });
        } finally {
          controller.signal.removeEventListener('abort', onAbort);
        }
      },
    );
    this.logger.log(`Image built on ${serverId}: ${result}`);
    return result;
  }

  async pullImage(
    client: Docker,
    serverId: string,
    imageRef: string,
    auth?: { username: string; password: string; serveraddress?: string },
  ): Promise<void> {
    const timeoutMs = this.getTimeoutMs('DOCKER_PULL_TIMEOUT_MS', 300_000);
    await this.withTimeout(
      `pullImage ${imageRef} (serveur ${serverId})`,
      timeoutMs,
      async (controller) => {
        const stream = await (client as unknown as DockerStreamApi).pull(
          imageRef,
          { authconfig: auth },
        );
        const onAbort = () => {
          (stream as unknown as { destroy?: () => void }).destroy?.();
        };
        controller.signal.addEventListener('abort', onAbort);
        try {
          await new Promise<void>((resolve, reject) => {
            client.modem.followProgress(stream, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        } finally {
          controller.signal.removeEventListener('abort', onAbort);
        }
      },
    );
    this.logger.log(`Image pulled on ${serverId}: ${imageRef}`);
  }

  async pruneDanglingImages(client: Docker, serverId: string): Promise<void> {
    try {
      await client.pruneImages({ filters: { dangling: { true: true } } });
      this.logger.log(`Pruned dangling images on server ${serverId}`);
    } catch (err) {
      this.logger.warn(
        `Image prune skipped on ${serverId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  private getTimeoutMs(
    envVar: 'DOCKER_BUILD_TIMEOUT_MS' | 'DOCKER_PULL_TIMEOUT_MS',
    fallbackMs: number,
  ): number {
    const raw = this.configService.get<string>(envVar);
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
  }

  private async withTimeout<T>(
    label: string,
    timeoutMs: number,
    run: (controller: AbortController) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `Docker ${label} a dépassé le délai de ${timeoutMs}ms — abandon.`,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([run(controller), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
