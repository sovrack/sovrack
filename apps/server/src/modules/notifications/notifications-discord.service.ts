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
} from './notifications-payloads.types';
import { assertSafeOutboundHttpsUrl } from '../../shared/http/outbound-url-policy.util';

@Injectable()
export class NotificationsDiscordService {
  private readonly logger = new Logger(NotificationsDiscordService.name);

  constructor(
    private readonly config: NotificationsConfigService,
    private readonly httpService: HttpService,
  ) {}

  private safeDiscordWebhookUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    assertSafeOutboundHttpsUrl(trimmed);
    const parsed = new URL(trimmed);
    const allowedHosts = [
      'discord.com',
      'discordapp.com',
      'canary.discord.com',
      'ptb.discord.com',
    ];
    if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new Error(`Hostname Discord non autorisé : ${parsed.hostname}`);
    }
    return parsed.toString();
  }

  async sendSimpleDiscord(content: string): Promise<void> {
    try {
      const webhookUrl = await this.config.get('DISCORD_WEBHOOK_URL');
      if (!webhookUrl) return;
      const safeWebhookUrl = this.safeDiscordWebhookUrl(webhookUrl);
      await firstValueFrom(
        this.httpService.post(safeWebhookUrl, { content }, { timeout: 8000 }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Discord alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async sendDeploymentDiscord(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    try {
      const webhookUrl = await this.config.get('DISCORD_WEBHOOK_URL');
      if (!webhookUrl) return;
      const safeWebhookUrl = this.safeDiscordWebhookUrl(webhookUrl);

      const isSuccess = payload.status === 'SUCCESS';
      const color = isSuccess ? 0x22c55e : 0xef4444; // Green or Red
      const emoji = isSuccess ? '✅' : '❌';

      const embed = {
        title: `${emoji} Déploiement Sovrack ${payload.status}`,
        description: `Projet **${payload.projectName}** (${payload.environmentName})`,
        color,
        fields: [
          { name: 'Projet', value: payload.projectName, inline: true },
          { name: 'Branche', value: payload.branch, inline: true },
          { name: 'Statut', value: payload.status, inline: true },
          { name: 'Déclenché par', value: payload.triggeredBy, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Sovrack Automation' },
      };

      await firstValueFrom(
        this.httpService.post(
          safeWebhookUrl,
          { embeds: [embed] },
          { timeout: 8000 },
        ),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Discord deployment alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async sendDockerConnectionDiscord(
    payload: DockerConnectionDownPayload | DockerConnectionRecoveredPayload,
    isRecovered: boolean,
  ): Promise<void> {
    try {
      const webhookUrl = await this.config.get('DISCORD_WEBHOOK_URL');
      if (!webhookUrl) return;
      const safeWebhookUrl = this.safeDiscordWebhookUrl(webhookUrl);

      const color = isRecovered ? 0x22c55e : 0xf59e0b;
      const title = isRecovered
        ? '💚 Connexion Docker rétablie'
        : '⚠️ Déconnexion Docker détectée';

      const serverName = payload.serverName ?? payload.serverId;
      const embed = {
        title,
        description: `Serveur: **${serverName}** (${payload.endpoint})`,
        color,
        timestamp: new Date().toISOString(),
        footer: { text: 'Sovrack Monitoring' },
      };

      await firstValueFrom(
        this.httpService.post(
          safeWebhookUrl,
          { embeds: [embed] },
          { timeout: 8000 },
        ),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Discord docker alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
