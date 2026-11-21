import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import { DockerConnectionsService } from './docker-connections.service';

interface DecryptedDockerTls {
  ca: string;
  cert: string;
  key: string;
  endpoint: string;
}

/** Maximum number of Docker clients held simultaneously (one per server). */
const CACHE_MAX_SIZE = 100;
/** Clients older than this are evicted and rebuilt on next access (10 min). */
const CACHE_TTL_MS = 10 * 60 * 1_000;

@Injectable()
export class DockerClientFactory {
  private readonly logger = new Logger(DockerClientFactory.name);

  private readonly clientCache = new Map<
    string,
    { client: Docker; endpoint: string; cachedAt: number }
  >();

  constructor(private readonly dockerConnections: DockerConnectionsService) {}

  async getOrCreate(
    serverId: string,
    endpoint: string,
    updatedAt: Date,
  ): Promise<Docker> {
    // Key includes updatedAt so a TLS cert/endpoint rotation yields a new key.
    const cacheKey = `${serverId}:${endpoint}:${updatedAt.getTime()}`;
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
    const client = this.buildClient(endpoint, tls);

    // Evict the oldest entry when the cache is full (LRU eviction).
    if (this.clientCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = this.clientCache.keys().next().value as
        string | undefined;
      if (oldestKey !== undefined) {
        this.clientCache.delete(oldestKey);
      }
    }

    this.clientCache.set(cacheKey, {
      client,
      endpoint,
      cachedAt: now,
    });
    this.logger.log(
      `Docker client initialized for server ${serverId} at ${endpoint}`,
    );
    return client;
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
