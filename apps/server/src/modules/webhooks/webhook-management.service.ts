import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { PlatformService } from '../platform/platform.service';
import { WebhooksService } from './webhooks.service';

/**
 * Manages the WebhookEndpoint lifecycle for projects/services: create or
 * find the endpoint, register the unified URL on the provider side
 * (GitLab / GitHub) via {@link IGitProvider.configureWebhook}, and expose
 * status / pause / resume to the UI.
 *
 * Identity is the endpoint's `webhookToken` (unified URL); the optional
 * `serviceEnvId` scopes the endpoint to a specific service/environment so
 * a multi-service project can route each repo's events independently.
 */
@Injectable()
export class WebhookManagementService {
  private readonly logger = new Logger(WebhookManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
    private readonly sourceProviders: SourceProvidersService,
    private readonly platformService: PlatformService,
  ) {}

  /**
   * Ensures a WebhookEndpoint exists for the project/serviceEnv (creating
   * one with a fresh token if absent), then registers the unified webhook
   * URL on the provider side. Idempotent: safe to call repeatedly.
   */
  async configureForProject(
    projectId: string,
    serviceEnvId?: string,
  ): Promise<{ webhookUrl: string; isNew: boolean }> {
    // Invariant : provider lié au SERVICE. Si on cible un serviceEnv, on
    // résout via SON service (serviceEnvId → serviceId → forService) ;
    // sinon fallback projet (webhook projet mono-provider).
    let serviceIdForProvider: string | null = null;
    if (serviceEnvId) {
      const se = await this.prisma.serviceEnvironment.findUnique({
        where: { id: serviceEnvId },
        select: { serviceId: true },
      });
      serviceIdForProvider = se?.serviceId ?? null;
    }
    const provider = serviceIdForProvider
      ? await this.sourceProviders.forService(serviceIdForProvider)
      : await this.sourceProviders.forProject(projectId);

    const before = await this.prisma.webhookEndpoint.findFirst({
      where: {
        projectId,
        serviceEnvId: serviceEnvId ?? null,
        provider: provider.type,
      },
      select: { id: true },
    });

    const endpoint = await this.webhooksService.getOrCreateEndpoint({
      projectId,
      serviceEnvId: serviceEnvId ?? null,
      provider: provider.type,
      events: [],
    });
    const isNew = !before;

    const webhookUrl = await this.platformService.buildWebhookUrl(
      `webhooks/incoming/${endpoint.webhookToken}`,
    );

    try {
      // Use the endpoint token as the shared secret for provider-side
      // signature configuration (kept consistent with prior behaviour).
      await provider.configureWebhook(
        projectId,
        webhookUrl,
        endpoint.webhookToken,
        serviceEnvId,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to register webhook on provider for project ${projectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { webhookUrl, isNew };
  }

  /**
   * Webhook PAR SERVICE (1 service = 1 repo = 1 webhook). La branche du push
   * route ensuite vers le bon environnement (ServiceEnvironment.autoBranch).
   * Idempotent ; enregistre l'URL sur le repo du service (best-effort).
   */
  async configureForService(
    projectId: string,
    serviceId: string,
  ): Promise<{ webhookUrl: string; isNew: boolean }> {
    const provider = await this.sourceProviders.forService(serviceId);

    const before = await this.prisma.webhookEndpoint.findFirst({
      where: { serviceId, provider: provider.type },
      select: { id: true },
    });
    const endpoint = await this.webhooksService.getOrCreateEndpoint({
      projectId,
      serviceId,
      provider: provider.type,
      events: [],
    });
    const isNew = !before;

    const webhookUrl = await this.platformService.buildWebhookUrl(
      `webhooks/incoming/${endpoint.webhookToken}`,
    );
    try {
      await provider.configureWebhook(
        projectId,
        webhookUrl,
        endpoint.webhookToken,
        undefined,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Auto-register webhook on provider failed for service ${serviceId} (URL copiable manuellement): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return { webhookUrl, isNew };
  }

  /** Statut webhook d'un service (URL, actif, dernier event). */
  async getStatusForService(serviceId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { serviceId },
      select: {
        id: true,
        isActive: true,
        webhookToken: true,
        provider: true,
        lastEventAt: true,
      },
    });
    if (!endpoint) {
      return { configured: false as const };
    }
    const webhookUrl = await this.platformService.buildWebhookUrl(
      `webhooks/incoming/${endpoint.webhookToken}`,
    );
    return {
      configured: true as const,
      isActive: endpoint.isActive,
      provider: endpoint.provider,
      webhookUrl,
      lastEventAt: endpoint.lastEventAt,
    };
  }

  /** Pause/reprise du webhook d'un service. */
  async setActiveForService(
    serviceId: string,
    isActive: boolean,
  ): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { serviceId },
    });
    if (!endpoint)
      throw new NotFoundException(
        'Webhook endpoint not found for this service',
      );
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { isActive },
    });
  }

  /** Pause or resume an endpoint without deleting it. */
  async setActive(
    projectId: string,
    isActive: boolean,
    serviceEnvId?: string,
  ): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceEnvId: serviceEnvId ?? null },
    });
    if (!endpoint)
      throw new NotFoundException(
        'Webhook endpoint not found for this project',
      );
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { isActive },
    });
  }

  /** Current webhook status for a project/serviceEnv. */
  async getStatus(projectId: string, serviceEnvId?: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceEnvId: serviceEnvId ?? null },
      select: { id: true, isActive: true, webhookToken: true, provider: true },
    });

    if (!endpoint) {
      return { configured: false };
    }

    const webhookUrl = await this.platformService.buildWebhookUrl(
      `webhooks/incoming/${endpoint.webhookToken}`,
    );

    return {
      configured: true,
      isActive: endpoint.isActive,
      provider: endpoint.provider,
      webhookUrl,
    };
  }
}
