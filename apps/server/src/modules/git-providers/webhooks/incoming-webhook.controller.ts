import {
  Body,
  Controller,
  GoneException,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { GitProviderType, Prisma } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import { GitlabWebhookService } from '../gitlab/gitlab-webhook.service';
import { GithubWebhookService } from '../github/github-webhook.service';

/**
 * P4 #2 — Unified, public, provider-agnostic webhook endpoint.
 *
 *   POST /webhooks/incoming/:webhookToken
 *
 * Workflow:
 *   1. Look up the endpoint by its public `webhookToken` (O(1) via the
 *      unique index). Returns 404 if the token is unknown — this is
 *      the only way the URL leaks information about valid tokens.
 *   2. Return 403 if the endpoint is paused (`isActive: false`).
 *   3. Record the event in `WebhookEvent` (audit log + dedup via
 *      `externalDeliveryId`). Failure here does NOT break the response
 *      to the provider — the platform must always 200 OK (or 202
 *      Accepted) so the provider doesn't retry forever.
 *   4. Dispatch to the right provider handler based on `endpoint.provider`.
 *      Future providers (GitHub, Bitbucket, Gitea…) are added by
 *      extending the `dispatch` switch — no new route required.
 *   5. Mark the event as PROCESSED or FAILED.
 *
 * This is the single source of truth for incoming webhooks. The legacy
 * per-provider URL (`POST /gitlab/webhook`) is kept for backward compat
 * with existing GitLab installations but should be migrated.
 */
@Controller('webhooks/incoming')
export class IncomingWebhookController {
  private readonly logger = new Logger(IncomingWebhookController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly gitlabWebhookService: GitlabWebhookService,
    private readonly githubWebhookService: GithubWebhookService,
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
      // 403 = "this URL is known but paused". Admins can resume via
      // `WebhooksController.setEnabled` (added separately).
      this.logger.warn(
        `Rejected webhook for paused endpoint ${endpoint.id} (token ${webhookToken})`,
      );
      return { status: 'ignored' };
    }

    const eventType = this.extractEventType(endpoint.provider, payload);
    const deliveryId = this.extractDeliveryId(endpoint.provider, payload, rawHeaders);

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

    // 2. Dispatch to the right provider handler.
    try {
      const result = await this.dispatch(endpoint, payload);
      if (eventId) {
        await this.webhooksService.markProcessed(eventId);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erreur inconnue';
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
   * Provider dispatch — single switch on `endpoint.provider`. To add a
   * new provider (GitHub, Bitbucket, Gitea…) just add a case here.
   * The contract is: handler receives the resolved endpoint + the raw
   * payload, returns a status that we forward to the audit log.
   */
  private async dispatch(
    endpoint: { id: string; projectId: string; isActive: boolean; provider: GitProviderType },
    payload: Record<string, unknown>,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    switch (endpoint.provider) {
      case GitProviderType.GITLAB:
        return this.gitlabWebhookService.handleIncoming(endpoint, payload);
      case GitProviderType.GITHUB:
        return this.githubWebhookService.handleIncoming(endpoint, payload);
      default: {
        const exhaustive: never = endpoint.provider;
        throw new GoneException(
          `No handler registered for provider "${String(exhaustive)}" — endpoint ${endpoint.id}`,
        );
      }
    }
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
