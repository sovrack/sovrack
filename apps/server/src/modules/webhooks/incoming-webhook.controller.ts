import {
  Body,
  Controller,
  GoneException,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { GitProviderType, Prisma } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import {
  IWebhookHandler,
  WebhookEndpointContext,
  WEBHOOK_HANDLER,
} from './interfaces/webhook-handler.interface';

/**
 * Unified, public, provider-agnostic webhook endpoint.
 *
 *   POST /webhooks/incoming/:webhookToken
 *
 * Workflow:
 *   1. Resolve the endpoint by its public `webhookToken` (O(1) via the
 *      unique index). 404 if unknown — same status as a typo'd URL, so
 *      the endpoint never leaks which tokens exist. The resolved endpoint
 *      (projectId + serviceEnvId) is the ONLY identity signal; the payload
 *      is never consulted to decide *who* the event belongs to.
 *   2. Ignore (202) if the endpoint is paused (`isActive: false`).
 *   3. Record the event in `WebhookEvent` (audit log + dedup via
 *      `externalDeliveryId`). A failure here never breaks the response —
 *      the platform always returns 202 so the provider doesn't retry forever.
 *   4. Dispatch to the handler whose `provider` matches the endpoint. New
 *      providers register an {@link IWebhookHandler} under WEBHOOK_HANDLER;
 *      no new route, no new switch case here.
 *   5. Mark the event PROCESSED or FAILED.
 */
@Controller('webhooks/incoming')
export class IncomingWebhookController {
  private readonly logger = new Logger(IncomingWebhookController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    @Inject(WEBHOOK_HANDLER) private readonly handlers: IWebhookHandler[],
  ) {}

  @Post(':webhookToken')
  @HttpCode(HttpStatus.ACCEPTED)
  async handle(
    @Param('webhookToken') webhookToken: string,
    @Body() payload: Record<string, unknown>,
    @Headers() rawHeaders: Record<string, string | string[] | undefined>,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    const endpoint = await this.webhooksService.findByToken(webhookToken);
    if (!endpoint) {
      // 404 = "this URL is unknown". Deliberately the same status as a
      // typo'd URL — we don't want to leak which tokens exist.
      throw new NotFoundException('Webhook endpoint not found');
    }
    if (!endpoint.isActive) {
      this.logger.warn(
        `Rejected webhook for paused endpoint ${endpoint.id} (token ${webhookToken})`,
      );
      return { status: 'ignored' };
    }

    const eventType = this.extractEventType(endpoint.provider, payload);
    const deliveryId = this.extractDeliveryId(
      endpoint.provider,
      payload,
      rawHeaders,
    );

    // 1. Record (best-effort — failure here is logged but does not throw).
    let eventId: string | null = null;
    try {
      const recorded = await this.webhooksService.record({
        endpointId: endpoint.id,
        provider: endpoint.provider,
        eventType,
        externalDeliveryId: deliveryId,
        payload: payload as Prisma.InputJsonValue,
        headers: this.serializeHeaders(rawHeaders),
      });
      eventId = recorded.id;
    } catch (error) {
      this.logger.error(
        `Failed to record webhook event for endpoint ${endpoint.id}: ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
      // Continue — we still want to process the webhook even if the
      // audit log write failed (DB blip, etc).
    }

    // 2. Dispatch to the matching provider handler.
    try {
      const result = await this.dispatch(endpoint, payload);
      if (eventId) {
        await this.webhooksService.markProcessed(eventId);
      }
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'erreur inconnue';
      this.logger.error(
        `Dispatch failed for endpoint ${endpoint.id} (provider ${endpoint.provider}): ${message}`,
      );
      if (eventId) {
        await this.webhooksService
          .markFailed(eventId, message)
          .catch((markErr) =>
            this.logger.error(
              `markFailed also failed for event ${eventId}: ${
                markErr instanceof Error ? markErr.message : 'unknown'
              }`,
            ),
          );
      }
      return { status: 'ok' };
    }
  }

  /**
   * Provider dispatch via the handler registry. The handler receives the
   * fully-resolved endpoint context (identity) + the raw payload (event
   * data) and returns a status forwarded to the audit log. Adding a
   * provider = registering one more {@link IWebhookHandler}.
   */
  private async dispatch(
    endpoint: WebhookEndpointContext,
    payload: Record<string, unknown>,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    const handler = this.handlers.find((h) => h.provider === endpoint.provider);
    if (!handler) {
      throw new GoneException(
        `No handler registered for provider "${String(endpoint.provider)}" — endpoint ${endpoint.id}`,
      );
    }
    return handler.handleIncoming(endpoint, payload);
  }

  // ─── Header extraction helpers ──────────────────────────────────────────

  private extractEventType(
    provider: GitProviderType,
    payload: Record<string, unknown>,
  ): string {
    switch (provider) {
      case GitProviderType.GITLAB:
        return (
          (payload['object_kind'] as string | undefined) ??
          (payload['event_name'] as string | undefined) ??
          'unknown'
        );
      case GitProviderType.GITHUB:
        return (
          (payload['action'] as string | undefined) ??
          (payload['event'] as string | undefined) ??
          'unknown'
        );
      default:
        return 'unknown';
    }
  }

  private extractDeliveryId(
    provider: GitProviderType,
    payload: Record<string, unknown>,
    rawHeaders: Record<string, string | string[] | undefined>,
  ): string | null {
    const header = (name: string) => {
      const value = rawHeaders[name.toLowerCase()];
      if (Array.isArray(value)) return value[0];
      return value;
    };
    switch (provider) {
      case GitProviderType.GITLAB:
        return (
          header('x-gitlab-event-uuid') ??
          header('x-gitlab-webhook-uuid') ??
          (payload['delivery_id'] as string | undefined) ??
          null
        );
      case GitProviderType.GITHUB:
        return header('x-github-delivery') ?? null;
      default:
        return null;
    }
  }

  private serializeHeaders(
    rawHeaders: Record<string, string | string[] | undefined>,
  ): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (Array.isArray(value)) {
        out[key] = value[0] ?? null;
      } else {
        out[key] = value ?? null;
      }
    }
    return out;
  }
}
