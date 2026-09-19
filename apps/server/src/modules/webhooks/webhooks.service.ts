import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  GitProviderType,
  Prisma,
  WebhookEvent,
  WebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';
import { WebhookEndpointContext } from './interfaces/webhook-handler.interface';
import { WebhookEventsService } from './webhook-events.service';

// Re-exportés depuis webhook-events.service (leur foyer) pour rétrocompat des
// importeurs existants (webhook-retry.service…).
export {
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_RETRY_BACKOFF_MS,
  type RetryableWebhookEvent,
} from './webhook-events.service';
import type { RetryableWebhookEvent } from './webhook-events.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly events: WebhookEventsService,
  ) {}

  // ─── WebhookEndpoint lifecycle ───────────────────────────────────────────

  /**
   * Find an existing endpoint for (project, serviceEnv) or create a new one
   * with a freshly generated token + 32-byte secret. Idempotent: calling
   * it twice returns the same endpoint with the same token.
   */
  async getOrCreateEndpoint(params: {
    projectId: string;
    serviceEnvId?: string | null;
    serviceId?: string | null;
    provider: GitProviderType;
    events: string[];
  }): Promise<{ id: string; webhookToken: string; secret: string }> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: {
        projectId: params.projectId,
        serviceId: params.serviceId ?? null,
        serviceEnvId: params.serviceEnvId ?? null,
        provider: params.provider,
      },
    });
    if (existing) {
      // Endpoint existant : on déchiffre et renvoie le secret pour que le
      // provider puisse le synchroniser (update du hook). Si le endpoint
      // n'a pas de secret (legacy) ou que le déchiffrement échoue, on en
      // génère un nouveau.
      let secret = existing.secret
        ? this.crypto.decryptSafe(existing.secret)
        : null;
      if (!secret) {
        secret = randomBytes(32).toString('hex');
        if (existing.secret) {
          this.logger.warn(
            `Endpoint ${existing.id}: existing secret was corrupted, generating new one.`,
          );
        }
        await this.prisma.webhookEndpoint.update({
          where: { id: existing.id },
          // Une reconnexion explicite répare et réactive l'ancien endpoint que
          // la migration de sécurité a neutralisé faute de secret vérifiable.
          data: { secret: this.crypto.encrypt(secret), isActive: true },
        });
      }
      return { id: existing.id, webhookToken: existing.webhookToken, secret };
    }
    const secret = randomBytes(32).toString('hex');
    const created = await this.prisma.webhookEndpoint.create({
      data: {
        projectId: params.projectId,
        serviceId: params.serviceId ?? null,
        serviceEnvId: params.serviceEnvId ?? null,
        provider: params.provider,
        events: params.events,
        // Chiffré au repos ; déchiffré uniquement pour vérifier les signatures.
        secret: this.crypto.encrypt(secret),
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
  async findByToken(
    webhookToken: string,
  ): Promise<WebhookEndpointContext | null> {
    const row = await this.prisma.webhookEndpoint.findUnique({
      where: { webhookToken },
      select: {
        id: true,
        projectId: true,
        serviceEnvId: true,
        serviceId: true,
        provider: true,
        isActive: true,
        secret: true,
      },
    });
    if (!row) return null;
    return {
      ...row,
      // Déchiffré pour la vérification de signature ; null = endpoint legacy.
      secret: row.secret ? this.crypto.decryptSafe(row.secret) : null,
    };
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
  // ─── WebhookEvent lifecycle (délégué à WebhookEventsService) ─────────────
  // Façade rétrocompatible : les appelants (controllers, retry service)
  // continuent d'appeler webhooksService.X ; la logique vit dans events.

  record(params: {
    endpointId: string;
    provider: GitProviderType;
    eventType: string;
    externalDeliveryId?: string | null;
    payload: Prisma.InputJsonValue;
    headers: Prisma.InputJsonValue;
  }): Promise<{ id: string; deduplicated: boolean }> {
    return this.events.record(params);
  }

  markProcessed(
    eventId: string,
    normalizedEvent?: Prisma.InputJsonValue,
  ): Promise<WebhookEvent> {
    return this.events.markProcessed(eventId, normalizedEvent);
  }

  markFailed(
    eventId: string,
    errorMessage: string,
    options: { nextRetryAt?: Date; deadLetter?: boolean } = {},
  ): Promise<WebhookEvent> {
    return this.events.markFailed(eventId, errorMessage, options);
  }

  markDeadLetter(eventId: string): Promise<WebhookEvent> {
    return this.events.markDeadLetter(eventId);
  }

  listDueRetries(limit = 20): Promise<RetryableWebhookEvent[]> {
    return this.events.listDueRetries(limit);
  }

  claimForRetry(eventId: string): Promise<boolean> {
    return this.events.claimForRetry(eventId);
  }

  findEventForRetry(eventId: string): Promise<RetryableWebhookEvent> {
    return this.events.findEventForRetry(eventId);
  }

  resetForReplay(eventId: string): Promise<WebhookEvent> {
    return this.events.resetForReplay(eventId);
  }

  listEventsForEndpoint(
    endpointId: string,
    options: { status?: WebhookEventStatus; limit?: number } = {},
  ) {
    return this.events.listEventsForEndpoint(endpointId, options);
  }

  listEventsForProject(
    projectId: string,
    options: { limit?: number; status?: WebhookEventStatus } = {},
  ) {
    return this.events.listEventsForProject(projectId, options);
  }

  findEvent(id: string): Promise<WebhookEvent> {
    return this.events.findEvent(id);
  }

  async findEventForProject(
    id: string,
    projectId: string,
  ): Promise<WebhookEvent> {
    const event = await this.prisma.webhookEvent.findFirst({
      where: { id, endpoint: { projectId } },
    });
    if (!event) {
      throw new NotFoundException('Webhook event introuvable');
    }
    return event;
  }
}
