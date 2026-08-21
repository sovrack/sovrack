import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { SourceProvidersService } from '../source-providers/source-providers.service';
import { PlatformService } from '../platform/platform.service';
import { WebhooksService } from './webhooks.service';

/**
 * Manages the WebhookEndpoint lifecycle PER SERVICE (1 service = 1 repo =
 * 1 webhook): create or find the endpoint, register the unified URL on the
 * provider side (GitLab / GitHub) via {@link IGitProvider.configureWebhook},
 * and expose status / pause / resume to the UI.
 *
 * Identity is the endpoint's `webhookToken` (unified URL). The push branch
 * then routes to the right environment (ServiceEnvironment.autoBranch).
 *
 * NB: the old project/serviceEnv-level path was removed (dead in practice —
 * the UI always passes serviceId, see WebhookManagementController). Keeping a
 * single `serviceId` path is what makes endpoint identity unambiguous and
 * prevents the "two rows / two tokens for one service" duplication bug.
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

  private async assertServiceInProject(
    projectId: string,
    serviceId: string,
  ): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId },
      select: { id: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
  }

  /**
   * Webhook PAR SERVICE (1 service = 1 repo = 1 webhook). La branche du push
   * route ensuite vers le bon environnement (ServiceEnvironment.autoBranch).
   * Idempotent (côté base ET côté provider) ; enregistre l'URL sur le repo
   * du service (best-effort — l'URL reste copiable manuellement si l'appel
   * provider échoue).
   */
  async configureForService(
    projectId: string,
    serviceId: string,
  ): Promise<{ webhookUrl: string; isNew: boolean }> {
    await this.assertServiceInProject(projectId, serviceId);
    const provider = await this.sourceProviders.forService(serviceId);

    const before = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceId, provider: provider.type },
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
        endpoint.secret,
        serviceId,
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
  async getStatusForService(projectId: string, serviceId: string) {
    await this.assertServiceInProject(projectId, serviceId);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceId },
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
    projectId: string,
    serviceId: string,
    isActive: boolean,
  ): Promise<void> {
    await this.assertServiceInProject(projectId, serviceId);
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceId },
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
}
