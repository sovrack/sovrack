import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../core/database/prisma.service';
import { CryptoService } from '../../core/crypto/crypto.service';

const SLACK_WEBHOOK_KEY = 'SLACK_WEBHOOK_URL';
const NOTIFY_ON_SUCCESS_KEY = 'NOTIFY_ON_SUCCESS';
const NOTIFY_ON_FAILURE_KEY = 'NOTIFY_ON_FAILURE';
const SMTP_HOST_KEY = 'SMTP_HOST';
const SMTP_PORT_KEY = 'SMTP_PORT';
const SMTP_USER_KEY = 'SMTP_USER';
const SMTP_PASS_KEY = 'SMTP_PASS';
const SMTP_FROM_KEY = 'SMTP_FROM';
const SMTP_TO_KEY = 'SMTP_TO';

export type DeploymentNotificationPayload = {
  deploymentId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELED';
  projectName: string;
  environmentName: string;
  branch: string;
  triggeredBy: string;
  pipelineUrl?: string | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  private async getConfig(key: string): Promise<string | null> {
    const record = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!record) return null;
    if (record.isSecret) {
      try {
        return this.crypto.decrypt(record.value);
      } catch {
        return null;
      }
    }
    return record.value;
  }

  async notifyDeploymentFinished(payload: DeploymentNotificationPayload): Promise<void> {
    const [notifySuccess, notifyFailure] = await Promise.all([
      this.getConfig(NOTIFY_ON_SUCCESS_KEY),
      this.getConfig(NOTIFY_ON_FAILURE_KEY),
    ]);

    const shouldNotifySuccess = notifySuccess !== 'false';
    const shouldNotifyFailure = notifyFailure !== 'false';

    if (payload.status === 'SUCCESS' && !shouldNotifySuccess) return;
    if ((payload.status === 'FAILED' || payload.status === 'CANCELED') && !shouldNotifyFailure) return;

    await Promise.allSettled([
      this.sendSlackNotification(payload),
      this.sendEmailNotification(payload),
    ]);
  }

  private async sendSlackNotification(payload: DeploymentNotificationPayload): Promise<void> {
    try {
      const webhookUrl = await this.getConfig(SLACK_WEBHOOK_KEY);
      if (!webhookUrl) return;

      const emoji = payload.status === 'SUCCESS' ? '✅' : payload.status === 'FAILED' ? '❌' : '⛔';
      const color = payload.status === 'SUCCESS' ? '#36a64f' : '#dc2626';

      const blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `${emoji} *Déploiement ${payload.status}*` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Projet:*\n${payload.projectName}` },
            { type: 'mrkdwn', text: `*Environnement:*\n${payload.environmentName}` },
            { type: 'mrkdwn', text: `*Branche:*\n${payload.branch}` },
            { type: 'mrkdwn', text: `*Déclenché par:*\n${payload.triggeredBy}` },
          ],
        },
      ];

      if (payload.pipelineUrl) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: `<${payload.pipelineUrl}|Voir le pipeline GitLab>` },
        } as typeof blocks[0]);
      }

      await firstValueFrom(
        this.httpService.post(webhookUrl, { attachments: [{ color, blocks }] }, { timeout: 8000 }),
      );
      this.logger.log(`Slack notification sent for ${payload.deploymentId} (${payload.status})`);
    } catch (err) {
      this.logger.warn(`Slack notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async sendEmailNotification(payload: DeploymentNotificationPayload): Promise<void> {
    try {
      const [host, portStr, user, pass, from, to] = await Promise.all([
        this.getConfig(SMTP_HOST_KEY),
        this.getConfig(SMTP_PORT_KEY),
        this.getConfig(SMTP_USER_KEY),
        this.getConfig(SMTP_PASS_KEY),
        this.getConfig(SMTP_FROM_KEY),
        this.getConfig(SMTP_TO_KEY),
      ]);

      if (!host || !user || !pass || !to) return;

      const port = portStr ? parseInt(portStr, 10) : 587;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });

      const emoji = payload.status === 'SUCCESS' ? '✅' : payload.status === 'FAILED' ? '❌' : '⛔';
      const subject = `${emoji} Déploiement ${payload.status} — ${payload.projectName}`;

      const html = `
        <h2>${emoji} Déploiement ${payload.status}</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:6px 12px;font-weight:bold">Projet</td><td style="padding:6px 12px">${payload.projectName}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Environnement</td><td style="padding:6px 12px">${payload.environmentName}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Branche</td><td style="padding:6px 12px">${payload.branch}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Déclenché par</td><td style="padding:6px 12px">${payload.triggeredBy}</td></tr>
          ${payload.pipelineUrl ? `<tr><td style="padding:6px 12px;font-weight:bold">Pipeline</td><td style="padding:6px 12px"><a href="${payload.pipelineUrl}">Voir sur GitLab</a></td></tr>` : ''}
        </table>
      `;

      await transporter.sendMail({ from: from ?? user, to, subject, html });
      this.logger.log(`Email notification sent for ${payload.deploymentId} (${payload.status})`);
    } catch (err) {
      this.logger.warn(`Email notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getSettings(): Promise<{
    slackWebhookUrl: string;
    notifyOnSuccess: boolean;
    notifyOnFailure: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
    smtpTo: string;
  }> {
    const [webhookUrl, notifySuccess, notifyFailure, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtpTo] =
      await Promise.all([
        this.getConfig(SLACK_WEBHOOK_KEY),
        this.getConfig(NOTIFY_ON_SUCCESS_KEY),
        this.getConfig(NOTIFY_ON_FAILURE_KEY),
        this.getConfig(SMTP_HOST_KEY),
        this.getConfig(SMTP_PORT_KEY),
        this.getConfig(SMTP_USER_KEY),
        this.getConfig(SMTP_PASS_KEY),
        this.getConfig(SMTP_FROM_KEY),
        this.getConfig(SMTP_TO_KEY),
      ]);

    return {
      slackWebhookUrl: webhookUrl ?? '',
      notifyOnSuccess: notifySuccess !== 'false',
      notifyOnFailure: notifyFailure !== 'false',
      smtpHost: smtpHost ?? '',
      smtpPort: smtpPort ? parseInt(smtpPort, 10) : 587,
      smtpUser: smtpUser ?? '',
      smtpPass: smtpPass ?? '',
      smtpFrom: smtpFrom ?? '',
      smtpTo: smtpTo ?? '',
    };
  }

  async saveSettings(settings: {
    slackWebhookUrl?: string;
    notifyOnSuccess?: boolean;
    notifyOnFailure?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    smtpFrom?: string;
    smtpTo?: string;
  }): Promise<void> {
    const upsert = async (key: string, value: string, isSecret = false) => {
      const stored = isSecret ? this.crypto.encrypt(value) : value;
      await this.prisma.platformConfig.upsert({
        where: { key },
        create: { key, value: stored, isSecret },
        update: { value: stored, isSecret },
      });
    };
    const deleteIfEmpty = async (key: string, value: string | undefined, isSecret = false) => {
      if (typeof value === 'string') {
        if (value.trim()) await upsert(key, value.trim(), isSecret);
        else await this.prisma.platformConfig.deleteMany({ where: { key } });
      }
    };

    await Promise.all([
      deleteIfEmpty(SLACK_WEBHOOK_KEY, settings.slackWebhookUrl, true),
      ...(typeof settings.notifyOnSuccess === 'boolean' ? [upsert(NOTIFY_ON_SUCCESS_KEY, String(settings.notifyOnSuccess))] : []),
      ...(typeof settings.notifyOnFailure === 'boolean' ? [upsert(NOTIFY_ON_FAILURE_KEY, String(settings.notifyOnFailure))] : []),
      deleteIfEmpty(SMTP_HOST_KEY, settings.smtpHost),
      ...(typeof settings.smtpPort === 'number' ? [upsert(SMTP_PORT_KEY, String(settings.smtpPort))] : []),
      deleteIfEmpty(SMTP_USER_KEY, settings.smtpUser),
      deleteIfEmpty(SMTP_PASS_KEY, settings.smtpPass, true),
      deleteIfEmpty(SMTP_FROM_KEY, settings.smtpFrom),
      deleteIfEmpty(SMTP_TO_KEY, settings.smtpTo),
    ]);
  }
}
