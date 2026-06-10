import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Socket } from 'socket.io';
import { DockerApiService as DockerRemoteService } from '../../../core/docker/docker-api.service';

/**
 * Per-socket log streaming manager.
 *
 * Manages the lifecycle of active container-log subscriptions:
 *   - `subscribe()` opens a TLS stream via `DockerRemoteService` and
 *     pipes each line back to the socket as a `deployment:log` event
 *     (same shape as the in-process logs the gateway already emits,
 *     so the frontend has a single event handler).
 *   - `unsubscribe()` cancels the underlying stream via an
 *     `AbortController` and removes the subscription from the map.
 *   - `unsubscribeAll(socketId)` is called on `disconnect` to clean
 *     up all streams for a socket.
 *
 * Why a separate service: keeps the gateway thin (gateway is just
 * WebSocket glue) and lets us test the streaming logic without a
 * WebSocket server.
 */
@Injectable()
export class DeploymentsLogStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(DeploymentsLogStreamService.name);

  /**
   * Active subscriptions. Keyed by `${socketId}:${deploymentId}:${containerName}`
   * so a single socket can subscribe to multiple containers (e.g. a
   * sidecar + the main app) without interfering.
   */
  private readonly subscriptions = new Map<
    string,
    { abort: AbortController; deploymentId: string; containerName: string }
  >();

  constructor(private readonly dockerRemote: DockerRemoteService) {}

  /**
   * Open a TLS log stream from the server's Docker daemon and pipe
   * each line to the socket. Returns the subscription key (used to
   * unsubscribe).
   *
   * Failure modes:
   *   - `DockerConnection` not configured for the server → emits a
   *     `deployment:log-error` event and returns `null`. The client
   *     can show "streaming unavailable" and fall back to the
   *     in-process logs that are already buffered.
   *   - Container not found / not running → same, with a specific
   *     message.
   *   - Any other error → emitted as `deployment:log-error` and the
   *     subscription is cleaned up.
   */
  async subscribe(
    socket: Socket,
    params: {
      deploymentId: string;
      serverId: string;
      containerName: string;
      tail?: number;
    },
  ): Promise<string | null> {
    const key = `${socket.id}:${params.deploymentId}:${params.containerName}`;
    if (this.subscriptions.has(key)) {
      // Idempotent: re-subscribing returns the existing key.
      return key;
    }
    const abort = new AbortController();
    this.subscriptions.set(key, {
      abort,
      deploymentId: params.deploymentId,
      containerName: params.containerName,
    });

    // Emit a "streaming started" marker so the client can clear its
    // existing log buffer and start appending the live stream.
    socket.emit('deployment:log-stream:started', {
      deploymentId: params.deploymentId,
      containerName: params.containerName,
    });

    // Run the pump in the background. We do NOT await it — the
    // subscription stays alive until `unsubscribe()` is called or
    // the client disconnects. The pump's rejection (if any) is
    // caught and reported via `deployment:log-error`.
    this.pump(socket, params, abort.signal, key).catch((err) => {
      this.logger.error(
        `Log pump crashed for ${key}: ${
          err instanceof Error ? err.message : 'erreur inconnue'
        }`,
      );
    });

    return key;
  }

  /**
   * Cancel a single subscription. Idempotent: returns true if a
   * subscription was actually cancelled, false if it was already
   * gone (e.g. the container exited and the pump finished naturally).
   */
  unsubscribe(key: string): boolean {
    const sub = this.subscriptions.get(key);
    if (!sub) return false;
    sub.abort.abort();
    this.subscriptions.delete(key);
    return true;
  }

  /**
   * Cancel all subscriptions for a socket. Called from the gateway's
   * `handleDisconnect` hook. Returns the number of subscriptions
   * cancelled (useful for the cleanup log).
   */
  unsubscribeAll(socketId: string): number {
    let count = 0;
    for (const [key, sub] of this.subscriptions) {
      if (key.startsWith(`${socketId}:`)) {
        sub.abort.abort();
        this.subscriptions.delete(key);
        count++;
      }
    }
    return count;
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Background pump: consumes `DockerRemoteService.streamContainerLogs`
   * and emits each line as a `deployment:log` event. Aborts cleanly
   * when `signal.aborted` is true (caller cancelled) or when the
   * underlying stream ends (container exited).
   */
  private async pump(
    socket: Socket,
    params: {
      deploymentId: string;
      serverId: string;
      containerName: string;
      tail?: number;
    },
    signal: AbortSignal,
    key: string,
  ): Promise<void> {
    try {
      const iterable = this.dockerRemote.streamContainerLogs(
        params.serverId,
        params.containerName,
        { follow: true, tail: params.tail ?? 100 },
      );
      for await (const line of iterable) {
        if (signal.aborted) {
          return;
        }
        if (!socket.connected) {
          // Client gone — cancel ourselves to free the TLS stream.
          this.unsubscribe(key);
          return;
        }
        // Use the same `deployment:log` shape as the in-process
        // logger so the frontend has a single event handler.
        socket.emit('deployment:log', {
          deploymentId: params.deploymentId,
          message: line.line,
          level: line.stream === 'stderr' ? 'error' : 'info',
          timestamp: new Date().toISOString(),
        });
      }
      // Stream ended naturally (container exited / `follow: false`
      // exhausted the buffer). Notify the client.
      socket.emit('deployment:log-stream:ended', {
        deploymentId: params.deploymentId,
        containerName: params.containerName,
        reason: 'stream-completed',
      });
    } catch (error) {
      this.logger.warn(
        `Log stream error for ${key}: ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
      socket.emit('deployment:log-error', {
        deploymentId: params.deploymentId,
        containerName: params.containerName,
        message:
          error instanceof Error
            ? error.message
            : 'Erreur inconnue du flux de logs',
      });
    } finally {
      this.subscriptions.delete(key);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // On app shutdown, abort all active subscriptions so the
    // underlying TLS sockets close cleanly.
    for (const sub of this.subscriptions.values()) {
      sub.abort.abort();
    }
    this.subscriptions.clear();
  }
}
