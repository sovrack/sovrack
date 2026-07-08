import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WebhookEventStatus } from '@prisma/client';
import { runsBackgroundWork } from '../../../shared/utils/process-role.util';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  IWebhookHandler,
  WEBHOOK_HANDLER,
  WebhookEndpointContext,
} from '../interfaces/webhook-handler.interface';
import { RetryableWebhookEvent, WebhooksService } from '../webhooks.service';

/**
 * Retries FAILED webhook events with exponential backoff and notifies the admin
 * when an event is dead-lettered. Closes the "my push silently didn't deploy"
 * gap: a failed webhook is now retried (1m/5m/30m/2h) and, after 5 attempts,
 * dead-lettered with a notification + manual replay option.
 */
@Injectable()
export class WebhookRetryService {
  private readonly logger = new Logger(WebhookRetryService.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly notifications: NotificationsService,
    @Inject(WEBHOOK_HANDLER) private readonly handlers: IWebhookHandler[],
  ) {}

  @Cron('*/2 * * * *', { name: 'webhook-retry' })
  async retryFailedWebhooks(): Promise<void> {
    if (!runsBackgroundWork()) return;
    const due = await this.webhooksService.listDueRetries(20);
    if (due.length === 0) {
      return;
    }
    this.logger.log(`Retrying ${due.length} failed webhook(s)`);
    for (const event of due) {
      await this.retryOne(event);
    }
  }

  /**
   * Claim-then-dispatch one event. The atomic claim guarantees that two
   * overlapping cron runs never retry the same event.
   */
  private async retryOne(event: RetryableWebhookEvent): Promise<void> {
    const claimed = await this.webhooksService.claimForRetry(event.id);
    if (!claimed) {
      return; // another worker already took this event
    }
    await this.dispatchAndRecord(event);
  }

  /**
   * Manual replay (admin UI): reset the event and dispatch it immediately,
   * regardless of its previous state (FAILED or DEAD_LETTER).
   */
  async replayEvent(eventId: string): Promise<{ status: WebhookEventStatus }> {
    const event = await this.webhooksService.findEventForRetry(eventId);
    await this.webhooksService.resetForReplay(eventId);
    const result = await this.dispatchAndRecord(event);
    return { status: result };
  }

  private async dispatchAndRecord(
    event: RetryableWebhookEvent,
  ): Promise<WebhookEventStatus> {
    const handler = this.handlers.find(
      (h) => h.provider === event.endpoint.provider,
    );
    if (!handler) {
      return this.failAndMaybeNotify(
        event,
        `No handler for provider ${event.endpoint.provider}`,
      );
    }
    try {
      await handler.handleIncoming(
        this.toContext(event.endpoint),
        (event.payload ?? {}) as Record<string, unknown>,
      );
      await this.webhooksService.markProcessed(event.id);
      return WebhookEventStatus.PROCESSED;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'retry dispatch failed';
      return this.failAndMaybeNotify(event, message);
    }
  }

  private async failAndMaybeNotify(
    event: RetryableWebhookEvent,
    message: string,
  ): Promise<WebhookEventStatus> {
    const updated = await this.webhooksService.markFailed(event.id, message);
    if (updated.status === WebhookEventStatus.DEAD_LETTER) {
      this.logger.warn(
        `Webhook ${event.id} dead-lettered after ${updated.attempts} attempts`,
      );
      await this.notifications
        .notifyWebhookDeadLetter(updated, {
          id: event.endpoint.id,
          projectId: event.endpoint.projectId,
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Dead-letter notification failed for ${event.id}: ${
              err instanceof Error ? err.message : 'unknown'
            }`,
          ),
        );
    }
    return updated.status;
  }

  private toContext(endpoint: WebhookEndpointContext): WebhookEndpointContext {
    return {
      id: endpoint.id,
      projectId: endpoint.projectId,
      serviceEnvId: endpoint.serviceEnvId,
      serviceId: endpoint.serviceId,
      provider: endpoint.provider,
      isActive: endpoint.isActive,
    };
  }
}
