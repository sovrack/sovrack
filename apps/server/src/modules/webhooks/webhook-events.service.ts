import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GitProviderType,
  Prisma,
  WebhookEvent,
  WebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
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
 * Cycle de vie + état de retry des {@link WebhookEvent} : enregistrement
 * (avec déduplication des re-livraisons provider), transitions
 * processed/failed/dead-letter avec backoff exponentiel, claim atomique pour
 * retry, replay manuel et lectures pour l'UI/audit.
 *
 * Extrait de WebhooksService (qui gère désormais les endpoints) ; toute la
 * logique d'état des événements vit ici, indépendamment testable.
 */
@Injectable()
export class WebhookEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotence: if `externalDeliveryId` is provided and we have seen it
   * before, we return the existing event id without creating a new row.
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

    let event: { id: string };
    try {
      event = await this.prisma.webhookEvent.create({
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
    } catch (error) {
      // The database constraint is the final arbiter under concurrent provider
      // retries; the optimistic lookup above only avoids the common exception.
      if (
        params.externalDeliveryId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.webhookEvent.findFirst({
          where: {
            endpointId: params.endpointId,
            externalDeliveryId: params.externalDeliveryId,
          },
          select: { id: true },
        });
        if (existing) return { id: existing.id, deduplicated: true };
      }
      throw error;
    }

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
    const isDeadLetter =
      options.deadLetter === true || nextAttempt >= WEBHOOK_MAX_ATTEMPTS;
    const backoffMs = WEBHOOK_RETRY_BACKOFF_MS[nextAttempt];
    const nextRetryAt = isDeadLetter
      ? null
      : (options.nextRetryAt ??
        new Date(
          Date.now() +
            (backoffMs ?? WEBHOOK_RETRY_BACKOFF_MS[WEBHOOK_MAX_ATTEMPTS - 1]),
        ));

    return this.prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: isDeadLetter
          ? WebhookEventStatus.DEAD_LETTER
          : WebhookEventStatus.FAILED,
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
          select: {
            id: true,
            projectId: true,
            serviceEnvId: true,
            serviceId: true,
            provider: true,
            isActive: true,
          },
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
   * Returns true only for the worker that won the race.
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
          select: {
            id: true,
            projectId: true,
            serviceEnvId: true,
            serviceId: true,
            provider: true,
            isActive: true,
          },
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
      include: {
        endpoint: { select: { id: true, webhookToken: true, provider: true } },
      },
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
