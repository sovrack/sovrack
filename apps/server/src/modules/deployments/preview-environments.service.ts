import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  DEPLOYMENT_PULL_REQUEST_EVENT,
  type AutoDeployTriggerEvent,
  type PullRequestWebhookEvent,
} from '../../shared/events/events.catalog';

export type PullRequestEventOptions = PullRequestWebhookEvent;

@Injectable()
export class PreviewEnvironmentsService {
  private readonly logger = new Logger(PreviewEnvironmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Traite l'événement de Pull Request / Merge Request pour créer ou détruire l'environnement éphémère.
   */
  @OnEvent(DEPLOYMENT_PULL_REQUEST_EVENT, { async: true })
  async handlePullRequest(options: PullRequestEventOptions): Promise<{
    handled: boolean;
    status: string;
    previewUrl?: string;
  }> {
    const { projectId, prNumber, headBranch, action } = options;
    this.logger.log(
      `PR #${prNumber} on project ${projectId} (branch: ${headBranch}) - action: ${action}`,
    );

    if (action === 'closed') {
      return this.teardownPreview(projectId, prNumber);
    }

    if (['opened', 'reopened', 'synchronize'].includes(action)) {
      return this.createOrUpdatePreview(projectId, prNumber, headBranch);
    }

    return { handled: false, status: 'ignored' };
  }

  /**
   * Crée ou met à jour l'environnement éphémère de prévisualisation (pr-X.preview.domaine).
   */
  async createOrUpdatePreview(
    projectId: string,
    prNumber: number,
    headBranch: string,
  ): Promise<{ handled: boolean; status: string; previewUrl?: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        services: {
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project || project.services.length === 0) {
      return { handled: false, status: 'project_or_service_not_found' };
    }

    const service = project.services[0];

    // Résout ou crée l'environnement type PREVIEW
    let previewEnv = await this.prisma.environment.findFirst({
      where: {
        projectId,
        name: 'preview',
      },
    });

    if (!previewEnv) {
      previewEnv = await this.prisma.environment.create({
        data: {
          name: 'preview',
          projectId,
        },
      });
    }

    const mrIdStr = String(prNumber);

    // Cherche si une cellule éphémère active existe déjà pour cette PR
    let serviceEnv = await this.prisma.serviceEnvironment.findFirst({
      where: {
        serviceId: service.id,
        previewMrId: mrIdStr,
        archivedAt: null,
      },
    });

    if (!serviceEnv) {
      serviceEnv = await this.prisma.serviceEnvironment.create({
        data: {
          serviceId: service.id,
          environmentId: previewEnv.id,
          isPreview: true,
          previewMrId: mrIdStr,
          previewBranch: headBranch,
          branch: headBranch,
          autoDeploy: true,
          autoBranch: headBranch,
        },
      });
      this.logger.log(
        `Created ephemeral preview ServiceEnvironment ${serviceEnv.id} for PR #${prNumber}`,
      );
    } else {
      // Mise à jour de la branche en cas de nouveau commit poussé sur la PR
      serviceEnv = await this.prisma.serviceEnvironment.update({
        where: { id: serviceEnv.id },
        data: {
          previewBranch: headBranch,
          branch: headBranch,
          autoBranch: headBranch,
        },
      });
    }

    const baseDomain = process.env.PREVIEW_BASE_DOMAIN || 'preview.sovrack.com';
    const previewHost = `pr-${prNumber}-${project.name.toLowerCase().replace(/[^a-z0-9-]/g, '')}.${baseDomain}`;

    // Attache le domaine de prévisualisation si absent
    const existingDomain = await this.prisma.domain.findFirst({
      where: {
        name: previewHost,
        projectId,
      },
    });

    if (!existingDomain) {
      await this.prisma.domain.create({
        data: {
          name: previewHost,
          projectId,
          serviceEnvId: serviceEnv.id,
          verified: true,
        },
      });
    }

    // Déclenche le déploiement automatique du conteneur pour la PR
    const triggerEvent: AutoDeployTriggerEvent = {
      projectId,
      branch: headBranch,
      pipelineId: prNumber,
      serviceId: service.id,
    };

    await this.eventEmitter.emitAsync(
      DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
      triggerEvent,
    );

    return {
      handled: true,
      status: 'preview_deployed',
      previewUrl: `https://${previewHost}`,
    };
  }

  /**
   * Détruit et archive la cellule éphémère lors de la fermeture ou du merge de la PR.
   */
  async teardownPreview(
    projectId: string,
    prNumber: number,
  ): Promise<{ handled: boolean; status: string }> {
    const mrIdStr = String(prNumber);

    const activePreviews = await this.prisma.serviceEnvironment.findMany({
      where: {
        service: { projectId },
        previewMrId: mrIdStr,
        archivedAt: null,
      },
    });

    for (const preview of activePreviews) {
      await this.prisma.serviceEnvironment.update({
        where: { id: preview.id },
        data: {
          archivedAt: new Date(),
          autoDeploy: false,
        },
      });

      // Supprime les sous-domaines preview temporaires associés
      await this.prisma.domain.deleteMany({
        where: { serviceEnvId: preview.id },
      });

      this.logger.log(
        `Archived ephemeral preview environment ${preview.id} for PR #${prNumber}`,
      );
    }

    return { handled: true, status: 'preview_torn_down' };
  }
}
