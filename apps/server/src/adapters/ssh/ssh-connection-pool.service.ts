import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  SshConnectParams,
  SshConnection,
  SshExecutorService,
} from './ssh-executor.service';

type IdleEntry = { conn: SshConnection; lastUsedAt: number };

/**
 * Reuses live SSH connections across short-lived operations on the SAME target
 * (host:port:user:key). Borrowers `acquire()` a connection and return it by
 * calling `dispose()` — the SshConnection contract is UNCHANGED, but here
 * `dispose()` returns the connection to the pool instead of closing it, so the
 * next `acquire()` skips the TCP+SSH handshake. This is purely additive:
 * `SshExecutorService.connect()` is untouched and one-shot callers keep using
 * it directly; only high-frequency paths (live container stats/monitoring,
 * polled in a loop) opt into the pool.
 *
 * Safety: a dead connection (NodeSSH.isConnected() === false) is detected and
 * replaced transparently on acquire; idle connections are swept after a TTL;
 * each target is capped to avoid unbounded growth. The cache key includes a
 * fingerprint of the auth material so a connection authenticated with one
 * key/password is never handed to a caller presenting different credentials.
 */
@Injectable()
export class SshConnectionPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(SshConnectionPoolService.name);
  private readonly idle = new Map<string, IdleEntry[]>();
  /** Max idle (kept-alive) connections retained per target. */
  private readonly maxIdlePerKey = 4;
  /** Idle connection lifetime before it is swept and closed. */
  private readonly idleTtlMs = 60_000;
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly executor: SshExecutorService) {
    this.sweeper = setInterval(() => {
      void this.evictExpired();
    }, 30_000);
    // Never keep the Node event loop alive just for the idle sweeper.
    this.sweeper.unref?.();
  }

  /**
   * Borrow a live connection to the target. Call the returned `dispose()` when
   * done — it returns the connection to the pool (the SshConnection contract is
   * unchanged, so existing `try { … } finally { await conn.dispose() }` code
   * works as-is, just without re-handshaking every time).
   */
  async acquire(params: SshConnectParams): Promise<SshConnection> {
    const key = this.keyOf(params);
    const bucket = this.idle.get(key);
    while (bucket && bucket.length > 0) {
      const entry = bucket.pop()!;
      if (entry.conn.client.isConnected()) {
        return this.lease(key, entry.conn);
      }
      // Stale/dropped connection — discard it and try the next idle one.
      await this.hardClose(entry.conn);
    }
    const conn = await this.executor.connect(params);
    return this.lease(key, conn);
  }

  /** Wrap a real connection so its `dispose()` returns it to the pool once. */
  private lease(key: string, conn: SshConnection): SshConnection {
    let returned = false;
    return {
      client: conn.client,
      dispose: () => {
        if (returned) return Promise.resolve();
        returned = true;
        return this.giveBack(key, conn);
      },
    };
  }

  private async giveBack(key: string, conn: SshConnection): Promise<void> {
    const bucket = this.idle.get(key) ?? [];
    if (conn.client.isConnected() && bucket.length < this.maxIdlePerKey) {
      bucket.push({ conn, lastUsedAt: Date.now() });
      this.idle.set(key, bucket);
      return;
    }
    // Dead or over capacity → really close it.
    await this.hardClose(conn);
  }

  private async evictExpired(): Promise<void> {
    const now = Date.now();
    for (const [key, bucket] of this.idle) {
      const survivors: IdleEntry[] = [];
      for (const entry of bucket) {
        const expired = now - entry.lastUsedAt > this.idleTtlMs;
        if (expired || !entry.conn.client.isConnected()) {
          await this.hardClose(entry.conn);
        } else {
          survivors.push(entry);
        }
      }
      if (survivors.length > 0) this.idle.set(key, survivors);
      else this.idle.delete(key);
    }
  }

  private async hardClose(conn: SshConnection): Promise<void> {
    try {
      await conn.dispose();
    } catch (err) {
      this.logger.debug(
        `Erreur en fermant une connexion SSH du pool: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private keyOf(params: SshConnectParams): string {
    const secret = params.privateKey ?? params.password ?? '';
    const fp = createHash('sha256').update(secret).digest('hex').slice(0, 12);
    return `${params.username}@${params.host}:${params.port}#${fp}`;
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.sweeper);
    for (const [, bucket] of this.idle) {
      for (const entry of bucket) await this.hardClose(entry.conn);
    }
    this.idle.clear();
  }
}
