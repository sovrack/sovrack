import { Injectable } from '@nestjs/common';
import { WebhookEvent } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { NotificationsConfigService } from './notifications-config.service';
import { NotificationsSmtpService } from './notifications-smtp.service';
import { NotificationsSlackService } from './notifications-slack.service';
import type { NotificationsSettings } from './notifications-config.service';

export type { NotificationsSettings };

export type DeploymentNotificationPayload = {
  deploymentId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELED';
  projectName: string;
  environmentName: string;
  branch: string;
  triggeredBy: string;
  pipelineUrl?: string | null;
};

export type DockerConnectionDownPayload = {
  serverId: string;
  serverName?: string;
  endpoint: string;
  lastError: string;
  failedSince: Date;
};

export type DockerConnectionRecoveredPayload = {
  serverId: string;
  serverName?: string;
  endpoint: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly configService: NotificationsConfigService,
    private readonly smtp: NotificationsSmtpService,
    private readonly slack: NotificationsSlackService,
    private readonly prisma: PrismaService,
  ) {}

  async notifyDeploymentFinished(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    const [notifySuccess, notifyFailure] = await Promise.all([
      this.configService.get('NOTIFY_ON_SUCCESS'),
      this.configService.get('NOTIFY_ON_FAILURE'),
    ]);
    if (payload.status === 'SUCCESS' && notifySuccess === 'false') return;
    if (
      (payload.status === 'FAILED' || payload.status === 'CANCELED') &&
      notifyFailure === 'false'
    )
      return;

    await Promise.allSettled([
      this.slack.sendDeploymentSlack(payload),
      this.smtp.sendDeploymentEmail(payload),
    ]);
  }

  async notifyDockerConnectionDown(
    payload: DockerConnectionDownPayload,
  ): Promise<void> {
    await Promise.allSettled([
      this.slack.sendDockerConnectionSlack(payload, false),
      this.smtp.sendDockerConnectionEmail(payload, false),
    ]);
  }

  async notifyDockerConnectionRecovered(
    payload: DockerConnectionRecoveredPayload,
  ): Promise<void> {
    await Promise.allSettled([
      this.slack.sendDockerConnectionSlack(payload, true),
      this.smtp.sendDockerConnectionEmail(payload, true),
    ]);
  }

  async notifyAutoHeal(payload: {
    serviceEnvId: string;
    containerName: string;
    reason: string;
  }): Promise<void> {
    const text =
      `🩹 Auto-heal : le conteneur \`${payload.containerName}\` a été détecté arrêté ` +
      `(${payload.reason}) et recréé automatiquement par le reconciler. ` +
      `Service-environnement : ${payload.serviceEnvId}.`;
    await Promise.allSettled([
      this.slack.sendSimpleSlack(text),
      this.smtp.sendSimpleEmail('Auto-heal', text, payload.containerName),
    ]);
  }

  async notifyConfigDrift(payload: {
    serviceEnvId: string;
    desiredGeneration: number;
    deployedGeneration: number;
  }): Promise<void> {
    const text =
      `⚠️ Config drift détecté sur le service-environnement \`${payload.serviceEnvId}\`. ` +
      `Génération désirée : ${payload.desiredGeneration}, déployée : ${payload.deployedGeneration}. ` +
      `Un redéploiement manuel est nécessaire pour appliquer les changements de configuration.`;
    await Promise.allSettled([
      this.slack.sendSimpleSlack(text),
      this.smtp.sendSimpleEmail('Config drift', text, payload.serviceEnvId),
    ]);
  }

  async notifyWebhookDeadLetter(
    event: WebhookEvent,
    endpoint: { id: string; projectId: string },
  ): Promise<void> {
    const project = await this.prisma.project
      .findUnique({ where: { id: endpoint.projectId }, select: { name: true } })
      .catch(() => null);
    const projectName = project?.name ?? endpoint.projectId;
    const deliveryId = event.externalDeliveryId ?? event.id;
    const text =
      `🪦 Webhook mort-lettre : le webhook \`${deliveryId}\` sur le projet ` +
      `*${projectName}* a échoué ${event.attempts} fois et ne sera plus retenté. ` +
      `Replay manuel disponible dans l'UI.`;
    await Promise.allSettled([
      this.slack.sendSimpleSlack(text),
      this.smtp.sendSimpleEmail('Webhook mort-lettre', text, projectName),
    ]);
  }

  async notifySslRenewalFailed(payload: {
    domainName: string;
    error: string;
  }): Promise<void> {
    const text =
      `🔒 SSL renewal failed for domain \`${payload.domainName}\`. ` +
      `Error: ${payload.error}. ` +
      `Manual renewal may be required before the certificate expires.`;
    await Promise.allSettled([
      this.slack.sendSimpleSlack(text),
      this.smtp.sendSimpleEmail('SSL Renewal Failed', text, payload.domainName),
    ]);
  }

  async getSettings(): Promise<NotificationsSettings> {
    return this.configService.getSettings();
  }

  async saveSettings(
    settings: Parameters<NotificationsConfigService['saveSettings']>[0],
  ): Promise<void> {
    return this.configService.saveSettings(settings);
  }
}
