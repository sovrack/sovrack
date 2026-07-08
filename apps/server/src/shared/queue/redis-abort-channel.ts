import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Cross-process abort relay over Redis pub/sub. A run executes in the worker
 * process (its AbortController lives there), but "Cancel" is triggered from the
 * API process. An in-memory abort can't cross processes, so the API publishes
 * the run id on a channel and the worker (subscribed) aborts locally.
 *
 * In single-process mode (PROCESS_ROLE unset / "all") the same process both
 * publishes and listens, so cancellation keeps working with no round-trip.
 *
 * Plain class (not @Injectable): each domain (setup, automation) wraps its own
 * instance with its own channel + abort callback, avoiding duplicated pub/sub.
 */
export class RedisAbortChannel {
  private readonly logger: Logger;
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor(
    private readonly channel: string,
    private readonly listen: boolean,
    private readonly onAbort: (id: string) => void,
  ) {
    this.logger = new Logger(`RedisAbortChannel:${channel}`);
  }

  init(): void {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      this.logger.warn(`REDIS_URL unset — abort channel ${this.channel} off`);
      return;
    }
    this.publisher = new Redis(url, { maxRetriesPerRequest: null });
    if (this.listen) {
      this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
      void this.subscriber.subscribe(this.channel).catch((err) => {
        this.logger.error(
          `subscribe(${this.channel}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
      this.subscriber.on('message', (_channel, id) => {
        this.logger.log(`Abort signal received for ${id}`);
        this.onAbort(id);
      });
    }
  }

  /** Abort locally (single-process fast path) then relay to other processes. */
  async requestAbort(id: string): Promise<void> {
    this.onAbort(id);
    await this.publisher?.publish(this.channel, id);
  }

  async close(): Promise<void> {
    await this.publisher?.quit().catch(() => undefined);
    await this.subscriber?.quit().catch(() => undefined);
  }
}
