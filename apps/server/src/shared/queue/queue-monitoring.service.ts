import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  timestamp: string;
}

@Injectable()
export class QueueMonitoringService {
  private readonly logger = new Logger(QueueMonitoringService.name);

  constructor(@Inject('DEPLOYMENTS_QUEUE') private readonly queue: Queue) {}

  /**
   * Get current queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
        this.queue.isPaused(),
      ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: paused ? 1 : 0,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get detailed queue information for monitoring
   */
  async getDetailedStatus() {
    const metrics = await this.getMetrics();
    const [waitingJobs, activeJobs, failedJobs] = await Promise.all([
      this.queue.getWaiting(0, 10), // Get first 10 waiting jobs
      this.queue.getActive(0, 10), // Get first 10 active jobs
      this.queue.getFailed(0, 10), // Get first 10 failed jobs
    ]);

    return {
      metrics,
      samples: {
        waiting: waitingJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data as unknown,
          timestamp: new Date(job.timestamp).toISOString(),
        })),
        active: activeJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data as unknown,
          processedOn: job.processedOn
            ? new Date(job.processedOn).toISOString()
            : null,
        })),
        failed: failedJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data as unknown,
          failedReason: job.failedReason,
          timestamp: new Date(job.timestamp).toISOString(),
        })),
      },
    };
  }

  /**
   * Log queue metrics every 5 minutes for monitoring
   */
  @Cron('0 */5 * * * *') // Every 5 minutes
  async logMetrics() {
    try {
      const metrics = await this.getMetrics();

      // Log warnings for potential issues
      if (metrics.failed > 10) {
        this.logger.warn(
          `High failure rate detected: ${metrics.failed} failed jobs`,
        );
      }

      if (metrics.waiting > 50) {
        this.logger.warn(
          `Queue backlog detected: ${metrics.waiting} jobs waiting`,
        );
      }

      if (metrics.paused > 0) {
        this.logger.warn('Queue is paused - jobs will not be processed');
      }

      this.logger.debug(
        `Queue metrics: waiting=${metrics.waiting}, active=${metrics.active}, ` +
          `completed=${metrics.completed}, failed=${metrics.failed}`,
      );
    } catch (error) {
      this.logger.error('Failed to collect queue metrics', error);
    }
  }

  /**
   * Clean up old completed and failed jobs to prevent memory bloat
   */
  @Cron('0 0 * * * *') // Every hour
  async cleanupJobs() {
    try {
      // Remove completed jobs older than 24 hours
      await this.queue.clean(24 * 60 * 60 * 1000, 0, 'completed');

      // Remove failed jobs older than 7 days (keep longer for debugging)
      await this.queue.clean(7 * 24 * 60 * 60 * 1000, 0, 'failed');

      this.logger.log('Queue cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup queue jobs', error);
    }
  }

  /**
   * Pause/unpause the queue (for maintenance)
   */
  async pauseQueue(): Promise<void> {
    await this.queue.pause();
    this.logger.log('Queue paused for maintenance');
  }

  async resumeQueue(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Queue resumed');
  }

  /**
   * Get Redis connection info
   */
  async getRedisInfo(): Promise<{
    memory: Record<string, string>;
    keyspace: Record<string, string>;
  } | null> {
    try {
      // BullMQ expose le client ioredis ; on type seulement la méthode utilisée.
      const client = (await this.queue.client) as {
        info(section: string): Promise<string>;
      };
      const info = await client.info('memory');
      const keyspace = await client.info('keyspace');

      return {
        memory: this.parseRedisInfo(info),
        keyspace: this.parseRedisInfo(keyspace),
      };
    } catch (error) {
      this.logger.error('Failed to get Redis info', error);
      return null;
    }
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const lines = info.split('\r\n');
    const result: Record<string, string> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, ...values] = line.split(':');
        if (key && values.length > 0) {
          result[key] = values.join(':');
        }
      }
    }

    return result;
  }
}
