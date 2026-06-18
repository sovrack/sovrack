import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitProvidersService } from '../../git-providers/git-providers.service';
import { PlatformService } from '../../platform/platform.service';

/**
 * Manages WebhookEndpoint lifecycle for projects.
 *
 * Responsibilities:
 *   1. Create / find-or-create the WebhookEndpoint record for a project
 *   2. Generate and store the unique webhook token
 *   3. Call IGitProvider.configureWebhook() to register the URL on GitLab/GitHub side
 *   4. Expose status (isActive, token, url) to the UI
 *
 * One endpoint per project (or per service in GROUP mode).
 * The provider type is read from the project's GitProviderConfig.
 */
@Injectable()
export class ProjectWebhookService {
  private readonly logger = new Logger(ProjectWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gitProviders: GitProvidersService,
    private readonly platformService: PlatformService,
  ) {}

  /**
   * Ensures a WebhookEndpoint exists for the project (creates one if absent),
   * then registers the webhook URL on the provider side (GitLab / GitHub).
   * Idempotent: safe to call multiple times.
   */
  async configureForProject(
    projectId: string,
    serviceId?: string,
  ): Promise<{ webhookUrl: string; isNew: boolean }> {
    const provider = await this.gitProviders.forProject(projectId);

    let endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: {
        projectId,
        serviceId: serviceId ?? null,
      },
    });

    let isNew = false;
    if (!endpoint) {
      const token = this.generateToken();
      endpoint = await this.prisma.webhookEndpoint.create({
        data: {
          projectId,
          serviceId: serviceId ?? null,
          provider: provider.type,
          webhookToken: token,
          isActive: true,
          events: [],
        },
      });
      isNew = true;
    }

    const webhookUrl = await this.platformService.buildWebhookUrl(
      `webhooks/incoming/${endpoint.webhookToken}`,
    );
    const secret = endpoint.webhookToken;

    try {
      await provider.configureWebhook(projectId, webhookUrl, secret, serviceId);
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
   * Pause or resume a webhook endpoint (stops receiving events without deleting it).
   */
  async setActive(projectId: string, isActive: boolean, serviceId?: string): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceId: serviceId ?? null },
    });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found for this project');
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { isActive },
    });
  }

  /**
   * Get the current webhook status for a project.
   */
  async getStatus(projectId: string, serviceId?: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { projectId, serviceId: serviceId ?? null },
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

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}
