import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter backed by Redis pub/sub. With the API and worker running as
 * separate processes, a gateway `emit` from the worker (e.g. a live setup log
 * line) must reach the client whose WebSocket is connected to the API process.
 * The Redis adapter shares broadcast state across every Socket.IO server
 * instance, so an emit in one process fans out to clients on all of them.
 *
 * Used only when REDIS_URL is set (always, in this platform). Falls back to the
 * default in-memory adapter otherwise (single-process dev without Redis).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(url: string): void {
    this.pubClient = new Redis(url, { maxRetriesPerRequest: null });
    this.subClient = this.pubClient.duplicate();
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
