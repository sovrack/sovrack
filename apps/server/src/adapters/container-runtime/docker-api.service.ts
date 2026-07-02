import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PassThrough } from 'stream';
import Docker from 'dockerode';
import { ConfigService } from '@nestjs/config';
import { CircuitState } from '@prisma/client';
import { DockerConnectionsService } from './docker-connections.service';

// dockerode's buildImage/pull typings don't line up cleanly with our context /
// options shapes; this narrow interface keeps the two call sites type-safe
// (no `any` propagation) without changing any runtime behavior.
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

/** Maximum number of Docker clients held simultaneously (one per server). */
const CACHE_MAX_SIZE = 100;
/** Clients older than this are evicted and rebuilt on next access (10 min). */
const CACHE_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class DockerApiService {
  private readonly logger = new Logger(DockerApiService.name);

  /**
   * LRU-with-TTL cache keyed by `serverId:endpoint:updatedAtMs`.
   * - Max 100 entries: prevents unbounded growth with many servers.
   * - 10-minute TTL: forces periodic renewal so stale TLS material is never
   *   used indefinitely (complements the key rotation via updatedAt).
   * - Pure-Map LRU: entries are deleted from the front and re-inserted on
   *   access (Map iteration order = insertion order in V8).
   */
  private readonly clientCache = new Map<
    string,
    { client: Docker; endpoint: string; cachedAt: number }
  >();

  constructor(
    private readonly dockerConnections: DockerConnectionsService,
    private readonly configService: ConfigService,
  ) {}

  /** Résout un timeout configurable par variable d'environnement, avec repli. */
  private getTimeoutMs(
    envVar: 'DOCKER_BUILD_TIMEOUT_MS' | 'DOCKER_PULL_TIMEOUT_MS',
    fallbackMs: number,
  ): number {
    const raw = this.configService.get<string>(envVar);
    const parsed = raw !== undefined ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
  }

  /**
   * Fait courser `run()` contre un délai : si `timeoutMs` s'écoule avant que
   * `run()` ne se résolve, la promesse retournée rejette avec un message
   * explicite (au lieu de laisser l'appel Docker pendre indéfiniment), et le
   * `AbortController` fourni à `run()` est signalé (best-effort pour libérer
   * le flux HTTP sous-jacent si l'appelant peut le fermer).
   */
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

  /**
   * Capture les erreurs réseau (connexion perdue avec le daemon Docker) et les
   * re-lève avec un message explicite et exploitable côté appelant, plutôt que
   * de laisser remonter l'erreur brute de dockerode. Les erreurs non-réseau
   * (ex: 404 déjà géré par `isNotFound`) continuent de se comporter comme avant.
   */
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

    // Circuit ouvert (health-check a détecté 3+ échecs consécutifs) → on
    // échoue vite plutôt que de tenter une connexion TCP+TLS qui attendrait
    // le timeout réseau complet. Le health-check lui-même ne passe jamais par
    // getClient() (il sonde via DockerConnectionsService.probeReachability()
    // directement), donc ce garde-fou ne bloque jamais sa propre reprise
    // CLOSED→HALF_OPEN→CLOSED.
    if (conn.circuitState === CircuitState.OPEN) {
      throw new ServiceUnavailableException(
        `Serveur Docker injoignable (circuit ouvert) pour le serveur ${serverId}, réessayez plus tard.`,
      );
    }

    // Key includes updatedAt so a TLS cert/endpoint rotation yields a new key.
    const cacheKey = `${serverId}:${conn.endpoint}:${conn.updatedAt.getTime()}`;
    const now = Date.now();

    const cached = this.clientCache.get(cacheKey);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      // LRU: re-insert to move to end (most-recently-used).
      this.clientCache.delete(cacheKey);
      this.clientCache.set(cacheKey, cached);
      return cached.client;
    }

    // Cache miss or TTL expired → evict all entries for this server (cert
    // rotation safety) then build a fresh client.
    this.invalidateCache(serverId);

    const tls = await this.dockerConnections.getDecryptedTls(serverId);
    const client = this.buildClient(conn.endpoint, tls);

    // Evict the oldest entry when the cache is full (LRU eviction).
    if (this.clientCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = this.clientCache.keys().next().value as
        | string
        | undefined;
      if (oldestKey !== undefined) {
        this.clientCache.delete(oldestKey);
      }
    }

    this.clientCache.set(cacheKey, {
      client,
      endpoint: conn.endpoint,
      cachedAt: now,
    });
    this.logger.log(
      `Docker client initialized for server ${serverId} at ${conn.endpoint}`,
    );
    return client;
  }

  async inspectImage(
    serverId: string,
    imageRef: string,
  ): Promise<Docker.ImageInspectInfo | null> {
    const client = await this.getClient(serverId);
    try {
      return await client.getImage(imageRef).inspect();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async inspectContainer(
    serverId: string,
    containerName: string,
  ): Promise<Docker.ContainerInspectInfo> {
    return this.withNetworkErrorHandling('inspectContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      return client.getContainer(containerName).inspect();
    });
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
    return this.withNetworkErrorHandling('getContainerStats', serverId, async () => {
      const client = await this.getClient(serverId);
      return client.getContainer(containerName).stats({ stream: false });
    });
  }

  async listContainers(
    serverId: string,
    all = false,
  ): Promise<Docker.ContainerInfo[]> {
    return this.withNetworkErrorHandling('listContainers', serverId, async () => {
      const client = await this.getClient(serverId);
      return client.listContainers({ all });
    });
  }

  async createContainer(
    serverId: string,
    spec: Docker.ContainerCreateOptions,
  ): Promise<Docker.Container> {
    return this.withNetworkErrorHandling('createContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      const container = await client.createContainer(spec);
      this.logger.log(
        `Container created: ${spec.Image} → ${container.id.slice(0, 12)}`,
      );
      return container;
    });
  }

  async startContainer(serverId: string, containerName: string): Promise<void> {
    await this.withNetworkErrorHandling('startContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      await client.getContainer(containerName).start();
    });
  }

  /**
   * Branche un conteneur sur un réseau Docker additionnel (ex: réseau partagé
   * 'web' du reverse-proxy Traefik). Idempotent : ignore l'erreur « already
   * exists »/« already in network ».
   */
  async connectNetwork(
    serverId: string,
    network: string,
    containerName: string,
  ): Promise<void> {
    const client = await this.getClient(serverId);
    try {
      await client.getNetwork(network).connect({ Container: containerName });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        !/already exists|already in (the )?network|endpoint with name/i.test(
          msg,
        )
      ) {
        throw error;
      }
    }
  }

  async stopContainer(
    serverId: string,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await this.withNetworkErrorHandling('stopContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      await client.getContainer(containerName).stop({ t: timeoutSec });
    });
  }

  async restartContainer(
    serverId: string,
    containerName: string,
    timeoutSec = 10,
  ): Promise<void> {
    await this.withNetworkErrorHandling('restartContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      await client.getContainer(containerName).restart({ t: timeoutSec });
    });
  }

  async removeContainer(
    serverId: string,
    containerName: string,
    force = false,
  ): Promise<void> {
    await this.withNetworkErrorHandling('removeContainer', serverId, async () => {
      const client = await this.getClient(serverId);
      await client.getContainer(containerName).remove({ force });
    });
  }

  /**
   * Run a command inside a running container and capture its output. stdout is
   * returned as raw bytes (so binary dumps survive intact); stderr is decoded
   * as UTF-8 for diagnostics. Used by database backups (pg_dump / mysqldump).
   */
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

  /**
   * Run a command inside a container, piping `input` to its STDIN (used to
   * restore a DB dump into psql/mysql/mongorestore). Returns captured output +
   * exit code. Uses a hijacked exec stream so we can write stdin then EOF.
   */
  async execWithInput(
    serverId: string,
    containerName: string,
    cmd: string[],
    input: Buffer,
  ): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
    return this.withNetworkErrorHandling('execWithInput', serverId, async () => {
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

      // Write the dump to STDIN, then close it so the command reads EOF and exits.
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
    });
  }

  async buildImage(
    serverId: string,
    context: { src: string[]; dockerfile: string } | string,
    opts: { tag?: string; remote?: string } = {},
  ): Promise<string> {
    const timeoutMs = this.getTimeoutMs('DOCKER_BUILD_TIMEOUT_MS', 900_000);
    const result = await this.withTimeout(
      `buildImage (serveur ${serverId})`,
      timeoutMs,
      async (controller) => {
        const client = await this.getClient(serverId);
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
    this.logger.log(`Image built: ${result}`);
    return result;
  }

  async pullImage(
    serverId: string,
    imageRef: string,
    auth?: { username: string; password: string; serveraddress?: string },
  ): Promise<void> {
    const timeoutMs = this.getTimeoutMs('DOCKER_PULL_TIMEOUT_MS', 300_000);
    await this.withTimeout(
      `pullImage ${imageRef} (serveur ${serverId})`,
      timeoutMs,
      async (controller) => {
        const client = await this.getClient(serverId);
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
            client.modem.followProgress(
              stream as unknown as NodeJS.ReadableStream,
              (err) => {
                if (err) return reject(err);
                resolve();
              },
            );
          });
        } finally {
          controller.signal.removeEventListener('abort', onAbort);
        }
      },
    );
    this.logger.log(`Image pulled: ${imageRef}`);
  }

  /**
   * Supprime les images « dangling » (couches orphelines des anciens builds) sur
   * le serveur → évite que le disque du VPS se remplisse au fil des déploiements.
   * Best-effort : ne bloque jamais un déploiement.
   */
  async pruneDanglingImages(serverId: string): Promise<void> {
    try {
      const client = await this.getClient(serverId);
      await client.pruneImages({ filters: { dangling: { true: true } } });
      this.logger.log(`Pruned dangling images on server ${serverId}`);
    } catch (err) {
      this.logger.warn(
        `Image prune skipped on ${serverId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
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

  /**
   * Create a Docker bridge network if it does not already exist.
   * Throws if creation fails for any reason other than "already exists".
   */
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
    for (const key of this.clientCache.keys()) {
      if (key.startsWith(`${serverId}:`)) {
        this.clientCache.delete(key);
        this.logger.log(`Evicted Docker client cache for server ${serverId}`);
      }
    }
  }

  private buildClient(
    endpoint: string,
    tls: DecryptedDockerTls | null,
  ): Docker {
    const url = new URL(endpoint);
    // TLS material implies HTTPS transport even when the endpoint is written as
    // tcp:// — a Docker daemon on 2376 speaks HTTPS; sending plain HTTP yields
    // "Client sent an HTTP request to an HTTPS server".
    const useHttps =
      url.protocol === 'https:' || !!(tls && (tls.ca || tls.cert || tls.key));
    const options: Docker.DockerOptions = {
      host: url.hostname,
      port: Number(url.port || (useHttps ? 2376 : 80)),
      protocol: useHttps ? 'https' : 'http',
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

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
]);

/** Détecte une perte de connexion réseau vers le daemon Docker (pas un 404/409 applicatif). */
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

/**
 * Si `error` est une erreur réseau, retourne une nouvelle Error avec un
 * message explicite et exploitable côté appelant ; sinon retourne `error`
 * tel quel (les erreurs non-réseau, ex: 404 déjà géré par `isNotFound`,
 * gardent leur comportement d'origine).
 */
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
