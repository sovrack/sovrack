import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { GitProviderType, Prisma, WebhookEvent, WebhookEventStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { WebhookEndpointContext } from './interfaces/webhook-handler.interface';

/** After this many attempts a failed webhook is dead-lettered (no more retries). */
export const WEBHOOK_MAX_ATTEMPTS = 5;

/**
 * Exponential backoff keyed by the attempt number being scheduled:
 *   1 → 1 min · 2 → 5 min · 3 → 30 min · 4 → 2 h · 5+ → dead-letter.
 */
export const WEBHOOK_RETRY_BACKOFF_MS: Record<number, number> = {
  1: 60_000,
  2: 5 * 60_000,
  3: 30 * 60_000,
  4: 2 * 60 * 60_000,
};

/** A failed webhook ready to be retried, with its resolved endpoint context. */
export type RetryableWebhookEvent = {
  id: string;
  provider: GitProviderType;
  attempts: number;
  payload: Prisma.JsonValue;
  endpoint: WebhookEndpointContext;
};

/**
 * Service responsible for the observability + lifecycle layer of webhooks.
 *
 * Two responsibilities:
 *
 *  1. Manage {@link WebhookEndpoint} rows — one per (project, serviceEnv)
 *     pair. Each endpoint has a `webhookToken` (UUID v4, used in the
 *     public URL) which is the ONLY identity signal for incoming events.
 *
 *  2. Record every received webhook as a {@link WebhookEvent} row, with
 *     the raw payload, headers, status, attempts, and (when relevant)
 *     the normalized event. This is the audit log that makes "why did
 *     my push not trigger a deploy?" answerable.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── WebhookEndpoint lifecycle ───────────────────────────────────────────

  /**
   * Find an existing endpoint for (project, serviceEnv) or create a new one
   * with a freshly generated token + 32-byte secret. Idempotent: calling
   * it twice returns the same endpoint with the same token.
   */
  async getOrCreateEndpoint(params: {
    projectId: string;
    serviceEnvId?: string | null;
    provider: GitProviderType;
    events: string[];
  }): Promise<{ id: string; webhookToken: string; secret: string }> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: {
        projectId: params.projectId,
        serviceEnvId: params.serviceEnvId ?? null,
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
        serviceEnvId: params.serviceEnvId ?? null,
        provider: params.provider,
        events: params.events,
      },
      select: { id: true, webhookToken: true },
    });
    return { id: created.id, webhookToken: created.webhookToken, secret };
  }

  /**
   * Build the public webhook URL from the token. The route handler is
   * `POST /webhooks/incoming/:webhookToken` — the single, unified entry
   * point for every provider.
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
   * This is THE identity resolution for incoming webhooks: the returned
   * `projectId` + `serviceEnvId` tell handlers who the event belongs to,
   * with zero dependence on the payload contents. Does NOT check
   * `isActive` — the caller (controller) does that to return the right
   * HTTP status (404 for unknown, 403/ignored for disabled).
   */
  async findByToken(webhookToken: string): Promise<WebhookEndpointContext | null> {
    return this.prisma.webhookEndpoint.findUnique({
      where: { webhookToken },
      select: {
        id: true,
        projectId: true,
        serviceEnvId: true,
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

  /**
   * Record a failed attempt. Increments `attempts`, computes `nextRetryAt`
   * with exponential backoff, and dead-letters automatically once the attempt
   * count reaches {@link WEBHOOK_MAX_ATTEMPTS} (or when `options.deadLetter`).
   * Dead-lettered events get `nextRetryAt = null` so the retry cron skips them.
   */
  async markFailed(
    eventId: string,
    errorMessage: string,
    options: { nextRetryAt?: Date; deadLetter?: boolean } = {},
  ): Promise<WebhookEvent> {
    const current = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true },
    });
    const nextAttempt = (current?.attempts ?? 0) + 1;
    const isDeadLetter = options.deadLetter === true || nextAttempt >= WEBHOOK_MAX_ATTEMPTS;
    const backoffMs = WEBHOOK_RETRY_BACKOFF_MS[nextAttempt];
    const nextRetryAt = isDeadLetter
      ? null
      : (options.nextRetryAt ?? new Date(Date.now() + (backoffMs ?? WEBHOOK_RETRY_BACKOFF_MS[WEBHOOK_MAX_ATTEMPTS - 1])));

    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: isDeadLetter ? WebhookEventStatus.DEAD_LETTER : WebhookEventStatus.FAILED,
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
        errorMessage: errorMessage.slice(0, 50_000),
        nextRetryAt,
      },
    });
  }

  /** Force an event into the dead-letter state (no further retries). */
  async markDeadLetter(eventId: string): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: WebhookEventStatus.DEAD_LETTER, nextRetryAt: null },
    });
  }

  // ─── Retry support ───────────────────────────────────────────────────────

  /**
   * FAILED events whose `nextRetryAt` is due and that have not exhausted their
   * attempts, with the resolved endpoint context needed to re-dispatch.
   */
  async listDueRetries(limit = 20): Promise<RetryableWebhookEvent[]> {
    const rows = await this.prisma.webhookEvent.findMany({
      where: {
        status: WebhookEventStatus.FAILED,
        nextRetryAt: { lte: new Date() },
        attempts: { lt: WEBHOOK_MAX_ATTEMPTS },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
      select: {
        id: true,
        provider: true,
        attempts: true,
        payload: true,
        endpoint: {
          select: { id: true, projectId: true, serviceEnvId: true, provider: true, isActive: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      attempts: row.attempts,
      payload: row.payload,
      endpoint: row.endpoint,
    }));
  }

  /**
   * Atomically claim a FAILED event for retry by flipping it to RECEIVED.
   * Returns true only for the worker that won the race — two concurrent crons
   * can never both pick the same event (idempotence).
   */
  async claimForRetry(eventId: string): Promise<boolean> {
    const res = await this.prisma.webhookEvent.updateMany({
      where: { id: eventId, status: WebhookEventStatus.FAILED },
      data: { status: WebhookEventStatus.RECEIVED, lastAttemptAt: new Date() },
    });
    return res.count === 1;
  }

  /** Load an event with its endpoint context (used by manual replay). */
  async findEventForRetry(eventId: string): Promise<RetryableWebhookEvent> {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        provider: true,
        attempts: true,
        payload: true,
        endpoint: {
          select: { id: true, projectId: true, serviceEnvId: true, provider: true, isActive: true },
        },
      },
    });
    if (!row) {
      throw new NotFoundException(`WebhookEvent ${eventId} introuvable`);
    }
    return {
      id: row.id,
      provider: row.provider,
      attempts: row.attempts,
      payload: row.payload,
      endpoint: row.endpoint,
    };
  }

  /** Reset an event so it can be replayed from scratch (manual admin action). */
  async resetForReplay(eventId: string): Promise<WebhookEvent> {
    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: WebhookEventStatus.RECEIVED,
        attempts: 0,
        nextRetryAt: null,
        errorMessage: null,
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
