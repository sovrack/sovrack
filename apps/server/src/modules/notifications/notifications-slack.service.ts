import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  NotificationsConfigService,
  CONFIG_KEYS,
} from './notifications-config.service';
import type {
  DeploymentNotificationPayload,
  DockerConnectionDownPayload,
  DockerConnectionRecoveredPayload,
} from './notifications.service';

@Injectable()
export class NotificationsSlackService {
  private readonly logger = new Logger(NotificationsSlackService.name);

  constructor(
    private readonly config: NotificationsConfigService,
    private readonly httpService: HttpService,
  ) {}

  async sendSimpleSlack(text: string): Promise<void> {
    try {
      const webhookUrl = await this.config.get(CONFIG_KEYS.SLACK_WEBHOOK);
      if (!webhookUrl) return;
      await firstValueFrom(
        this.httpService.post(webhookUrl, { text }, { timeout: 8000 }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Slack alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async sendDeploymentSlack(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    try {
      const webhookUrl = await this.config.get(CONFIG_KEYS.SLACK_WEBHOOK);
      if (!webhookUrl) return;

      const emoji =
        payload.status === 'SUCCESS'
          ? '✅'
          : payload.status === 'FAILED'
            ? '❌'
            : '⛔';
      const color = payload.status === 'SUCCESS' ? '#36a64f' : '#dc2626';

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *Déploiement ${payload.status}*`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Projet:*\n${payload.projectName}` },
            {
              type: 'mrkdwn',
              text: `*Environnement:*\n${payload.environmentName}`,
            },
            { type: 'mrkdwn', text: `*Branche:*\n${payload.branch}` },
            {
              type: 'mrkdwn',
              text: `*Déclenché par:*\n${payload.triggeredBy}`,
            },
          ],
        },
      ];

      if (payload.pipelineUrl) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<${payload.pipelineUrl}|Voir le pipeline GitLab>`,
          },
        } as (typeof blocks)[0]);
      }

      await firstValueFrom(
        this.httpService.post(
          webhookUrl,
          { attachments: [{ color, blocks }] },
          { timeout: 8000 },
        ),
      );
      this.logger.log(
        `Slack notification sent for ${payload.deploymentId} (${payload.status})`,
      );
    } catch (err) {
      this.logger.warn(
        `Slack notification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async sendDockerConnectionSlack(
    payload: DockerConnectionDownPayload | DockerConnectionRecoveredPayload,
    recovered: boolean,
  ): Promise<void> {
    try {
      const webhookUrl = await this.config.get(CONFIG_KEYS.SLACK_WEBHOOK);
      if (!webhookUrl) return;

      const isDown = !recovered;
      const emoji = isDown ? '🔴' : '🟢';
      const verb = isDown ? 'INJOIGNABLE' : 'RÉCUPÉRÉ';
      const downPayload = payload as DockerConnectionDownPayload;
      const fields = [
        {
          type: 'mrkdwn',
          text: `*Serveur:*\n${downPayload.serverName ?? downPayload.serverId}`,
        },
        { type: 'mrkdwn', text: `*Endpoint Docker:*\n${payload.endpoint}` },
        ...(isDown
          ? [
              {
                type: 'mrkdwn',
                text: `*Erreur:*\n\`\`\`${downPayload.lastError.slice(0, 300)}\`\`\``,
              },
            ]
          : []),
      ];

      await firstValueFrom(
        this.httpService.post(webhookUrl, {
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${emoji} *Connexion Docker ${verb}*`,
              },
            },
            { type: 'section', fields },
          ],
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Docker connection Slack notification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
