import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { GitProviderType, Prisma, WebhookEvent, WebhookEventStatus } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Service responsible for the observability layer of webhooks (P4 of the
 * refactoring plan).
 *
 * Two responsibilities:
 *
 *  1. Manage {@link WebhookEndpoint} rows — one per (project, service)
 *     pair. Each endpoint has a `webhookToken` (UUID v4, used in the
 *     public URL) and a 32-byte random secret (used to verify the
 *     provider signature).
 *
 *  2. Record every received webhook as a {@link WebhookEvent} row, with
 *     the raw payload, headers, status, attempts, and (when relevant)
 *     the normalized event. This is the audit log that makes "why did
 *     my push not trigger a deploy?" answerable.
 *
 * Future work (not in this PR): a `WebhookProcessor` worker that picks
 * up PROCESSING events from a queue and processes them with retry +
 * dead-letter. For now the existing GitLab/GitHub webhook handlers
 * keep their synchronous flow and just call `record` to keep the audit
 * trail.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── WebhookEndpoint lifecycle ───────────────────────────────────────────

  /**
   * Find an existing endpoint for (project, service) or create a new one
   * with a freshly generated token + 32-byte secret. Idempotent: calling
   * it twice returns the same endpoint with the same token.
   */
  async getOrCreateEndpoint(params: {
    projectId: string;
    serviceId?: string | null;
    provider: GitProviderType;
    events: string[];
  }): Promise<{ id: string; webhookToken: string; secret: string }> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: {
        projectId: params.projectId,
        serviceId: params.serviceId ?? null,
        provider: params.provider,
      },
    });
    if (existing) {
      return {
        id: existing.id,
        webhookToken: existing.webhookToken,
        secret: '', // never expose the existing secret again
      };
    }
    const secret = randomBytes(32).toString('hex');
    const created = await this.prisma.webhookEndpoint.create({
      data: {
        projectId: params.projectId,
        serviceId: params.serviceId ?? null,
        provider: params.provider,
        events: params.events,
      },
      select: { id: true, webhookToken: true },
    });
    return { id: created.id, webhookToken: created.webhookToken, secret };
  }

  /**
   * Build the public webhook URL from the token. The route handler is
   * `POST /webhooks/incoming/:webhookToken` (P4 #2). The legacy
   * per-provider URLs (`POST /gitlab/webhook`) are kept for backward
   * compat but should be migrated.
   */
  buildPublicUrl(baseUrl: string, webhookToken: string): string {
    return `${baseUrl.replace(/\/$/, '')}/webhooks/incoming/${webhookToken}`;
  }

  async listEndpointsForProject(projectId: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Look up an endpoint by its public `webhookToken` (the UUID in the
   * `/webhooks/incoming/:webhookToken` URL). O(1) via the unique index
   * on `webhookToken`. Returns `null` if the token is unknown.
   *
   * Used by the public dispatch controller. Does NOT check `isActive` —
   * the caller (controller) does that to return the right HTTP status
   * (404 for unknown, 403 for disabled).
   */
  async findByToken(
    webhookToken: string,
  ): Promise<{ id: string; projectId: string; provider: GitProviderType; isActive: boolean } | null> {
    return this.prisma.webhookEndpoint.findUnique({
      where: { webhookToken },
      select: {
        id: true,
        projectId: true,
        provider: true,
        isActive: true,
      },
    });
  }

  /**
   * Pause (or resume) an endpoint. Used by the admin UI to mute a
   * misbehaving upstream (e.g. a fork that floods us with push events).
   * Returns the updated endpoint.
   */
  async setEnabled(endpointId: string, enabled: boolean) {
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { isActive: enabled },
      select: { id: true, isActive: true },
    });
    this.logger.log(
      `Endpoint ${endpointId} ${enabled ? 'reactivated' : 'paused'}`,
    );
    return updated;
  }

  // ─── WebhookEvent recording ─────────────────────────────────────────────

  /**
   * Record the receipt of a webhook. Returns the created event id (used
   * by callers to update the status once the event has been processed).
   *
   * Idempotence: if `externalDeliveryId` is provided and we have seen it
   * before, we return the existing event id without creating a new row.
   * This protects against provider retries (GitLab may re-deliver the
   * same webhook 3 times in a 5-minute window).
   */
  async record(params: {
    endpointId: string;
    provider: GitProviderType;
    eventType: string;
    externalDeliveryId?: string | null;
    payload: Prisma.InputJsonValue;
    headers: Prisma.InputJsonValue;
  }): Promise<{ id: string; deduplicated: boolean }> {
    if (params.externalDeliveryId) {
      const existing = await this.prisma.webhookEvent.findFirst({
        where: {
          endpointId: params.endpointId,
          externalDeliveryId: params.externalDeliveryId,
        },
        select: { id: true },
      });
      if (existing) {
        return { id: existing.id, deduplicated: true };
      }
    }

    const event = await this.prisma.webhookEvent.create({
      data: {
        endpointId: params.endpointId,
        provider: params.provider,
        eventType: params.eventType,
        externalDeliveryId: params.externalDeliveryId ?? null,
        payload: params.payload,
        headers: params.headers,
        status: WebhookEventStatus.RECEIVED,
      },
      select: { id: true },
    });

    await this.prisma.webhookEndpoint.update({
      where: { id: params.endpointId },
      data: { lastEventAt: new Date() },
    });

    return { id: event.id, deduplicated: false };
  }

  async markProcessed(
    eventId: string,
    normalizedEvent?: Prisma.InputJsonValue,
  ): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
        ...(normalizedEvent ? { normalizedEvent } : {}),
      },
    });
  }

  async markFailed(
    eventId: string,
    errorMessage: string,
    options: { nextRetryAt?: Date; deadLetter?: boolean } = {},
  ): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: options.deadLetter
          ? WebhookEventStatus.DEAD_LETTER
          : WebhookEventStatus.FAILED,
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
        errorMessage: errorMessage.slice(0, 50_000),
        ...(options.nextRetryAt ? { nextRetryAt: options.nextRetryAt } : {}),
      },
    });
  }

  // ─── Read APIs (UI / admin) ──────────────────────────────────────────────

  async listEventsForEndpoint(
    endpointId: string,
    options: { status?: WebhookEventStatus; limit?: number } = {},
  ) {
    return this.prisma.webhookEvent.findMany({
      where: {
        endpointId,
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: options.limit ?? 50,
    });
  }

  async listEventsForProject(
    projectId: string,
    options: { limit?: number; status?: WebhookEventStatus } = {},
  ) {
    return this.prisma.webhookEvent.findMany({
      where: {
        endpoint: { projectId },
        ...(options.status ? { status: options.status } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: options.limit ?? 100,
      include: { endpoint: { select: { id: true, webhookToken: true, provider: true } } },
    });
  }

  async findEvent(id: string): Promise<WebhookEvent> {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException(`WebhookEvent ${id} introuvable`);
    }
    return event;
  }
}
