import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DockerConnection, Prisma } from '@prisma/client';
import * as tls from 'node:tls';
import { PrismaService } from '../database/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

@Injectable()
export class DockerConnectionsService {
  private readonly logger = new Logger(DockerConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async upsert(params: {
    serverId: string;
    endpoint: string;
    tlsCaCert: string;
    tlsClientCert: string;
    tlsClientKey: string;
  }): Promise<DockerConnection> {
    const parsed = this.parseEndpoint(params.endpoint);

    if (parsed.port === 2375) {
      this.logger.warn(
        `DockerConnection for server ${params.serverId} uses port 2375 (unencrypted). Unsafe in production.`,
      );
    }

    const data: Prisma.DockerConnectionUncheckedCreateInput = {
      serverId: params.serverId,
      endpoint: params.endpoint,
      tlsCaCert: this.crypto.encrypt(params.tlsCaCert),
      tlsClientCert: this.crypto.encrypt(params.tlsClientCert),
      tlsClientKey: this.crypto.encrypt(params.tlsClientKey),
    };

    return this.prisma.dockerConnection.upsert({
      where: { serverId: params.serverId },
      create: data,
      update: data,
    });
  }

  async findForServer(serverId: string): Promise<DockerConnection> {
    const conn = await this.prisma.dockerConnection.findUnique({
      where: { serverId },
    });
    if (!conn) {
      throw new NotFoundException(
        `Aucune connexion Docker configurée pour le serveur ${serverId}`,
      );
    }
    return conn;
  }

  async listAll(): Promise<DockerConnection[]> {
    return this.prisma.dockerConnection.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async listForHealthCheck(): Promise<
    Array<{
      id: string;
      serverId: string;
      endpoint: string;
      isReachable: boolean;
      consecutiveFailures: number;
      circuitState: string;
      circuitOpenedAt: Date | null;
    }>
  > {
    return this.prisma.dockerConnection.findMany({
      select: {
        id: true,
        serverId: true,
        endpoint: true,
        isReachable: true,
        consecutiveFailures: true,
        circuitState: true,
        circuitOpenedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Persist a circuit-breaker state transition for a server's connection. */
  async persistCircuit(
    serverId: string,
    data: {
      circuitState?: string;
      consecutiveFailures?: number;
      circuitOpenedAt?: Date | null;
    },
  ): Promise<void> {
    await this.prisma.dockerConnection.updateMany({ where: { serverId }, data });
  }

  async remove(serverId: string): Promise<{ ok: true }> {
    await this.prisma.dockerConnection.delete({ where: { serverId } }).catch((err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
        throw new NotFoundException(`Aucune connexion Docker à supprimer pour le serveur ${serverId}`);
      }
      throw err;
    });
    return { ok: true };
  }

  // ─── TLS material ─────────────────────────────────────────────────────────

  async getDecryptedTls(serverId: string): Promise<{ ca: string; cert: string; key: string; endpoint: string }> {
    const conn = await this.findForServer(serverId);
    return {
      ca: this.crypto.decrypt(conn.tlsCaCert),
      cert: this.crypto.decrypt(conn.tlsClientCert),
      key: this.crypto.decrypt(conn.tlsClientKey),
      endpoint: conn.endpoint,
    };
  }

  // ─── Reachability probe ───────────────────────────────────────────────────

  async probeReachability(serverId: string): Promise<{ isReachable: true; apiVersion: string | null; latencyMs: number }> {
    const conn = await this.findForServer(serverId);
    const parsed = this.parseEndpoint(conn.endpoint);

    const ca = this.crypto.decrypt(conn.tlsCaCert);
    const cert = this.crypto.decrypt(conn.tlsClientCert);
    const key = this.crypto.decrypt(conn.tlsClientKey);

    const start = Date.now();
    const result = await new Promise<{ apiVersion: string | null; error: Error | null }>((resolve) => {
      const socket = tls.connect({
        host: parsed.host,
        port: parsed.port,
        ca,
        cert,
        key,
        servername: parsed.host,
        rejectUnauthorized: true,
        timeout: DEFAULT_PROBE_TIMEOUT_MS,
      });
      let apiVersion: string | null = null;
      let raw = '';

      socket.on('secureConnect', () => {
        socket.write(
          `GET /_ping HTTP/1.1\r\nHost: ${parsed.host}\r\nConnection: close\r\nUser-Agent: platform-platform-probe\r\n\r\n`,
        );
      });
      socket.on('data', (chunk) => {
        raw += chunk.toString('utf8');
        if (apiVersion === null) {
          const m = raw.match(/^[\s\S]*?\r\nApi-Version:\s*([^\r\n]+)/im);
          if (m) apiVersion = m[1].trim();
        }
      });
      socket.on('end', () => resolve({ apiVersion, error: null }));
      socket.on('error', (err) => resolve({ apiVersion, error: err }));
      socket.on('timeout', () => socket.destroy(new Error('TLS handshake timeout')));
    });
    const latencyMs = Date.now() - start;

    if (result.error) {
      await this.prisma.dockerConnection.update({
        where: { serverId },
        data: { isReachable: false, lastCheckedAt: new Date(), apiVersion: null },
      });
      throw new BadRequestException(`Connexion Docker injoignable: ${result.error.message}`);
    }

    await this.prisma.dockerConnection.update({
      where: { serverId },
      data: { isReachable: true, lastCheckedAt: new Date(), apiVersion: result.apiVersion },
    });

    return { isReachable: true, apiVersion: result.apiVersion, latencyMs };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  parseEndpoint(endpoint: string): { host: string; port: number } {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException(`Endpoint Docker invalide: "${endpoint}". Format: tcp://host:port`);
    }
    if (url.protocol !== 'tcp:') {
      throw new BadRequestException(
        `Endpoint Docker invalide: protocole "${url.protocol}" non supporté. Utilisez tcp://.`,
      );
    }
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException(`Endpoint Docker invalide: port "${url.port}" hors plage.`);
    }
    return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
  }
}
