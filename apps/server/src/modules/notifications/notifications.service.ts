import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as nodemailer from 'nodemailer';
import { WebhookEvent } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { CryptoService } from '../../shared/crypto/crypto.service';

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

/** Escapes HTML special characters to prevent injection in email bodies. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Config cache entry with a 60-second TTL to reduce DB round-trips. */
type CacheEntry = { value: string | null; expiresAt: number };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /** In-memory config cache: key → { value, expiresAt }. TTL = 60 s. */
  private readonly configCache = new Map<string, CacheEntry>();

  /**
   * Nodemailer transporter singleton keyed by a hash of the SMTP config.
   * Recreated only when the config changes, not on every notification.
   */
  private transporterCache: {
    key: string;
    transporter: ReturnType<typeof nodemailer.createTransport>;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly crypto: CryptoService,
  ) {}

  private async getConfig(key: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.configCache.get(key);
    if (cached && now < cached.expiresAt) {
      return cached.value;
    }

    const record = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    let value: string | null = null;
    if (record) {
      if (record.isSecret) {
        try {
          value = this.crypto.decrypt(record.value);
        } catch {
          value = null;
        }
      } else {
        value = record.value;
      }
    }

    this.configCache.set(key, { value, expiresAt: now + 60_000 });
    return value;
  }

  /**
   * Returns a cached nodemailer transporter or creates a new one when the
   * SMTP config has changed. Prevents opening a new TCP connection per email.
   */
  private async getTransporter(): Promise<ReturnType<
    typeof nodemailer.createTransport
  > | null> {
    const [host, portStr, user, pass] = await Promise.all([
      this.getConfig(SMTP_HOST_KEY),
      this.getConfig(SMTP_PORT_KEY),
      this.getConfig(SMTP_USER_KEY),
      this.getConfig(SMTP_PASS_KEY),
    ]);
    if (!host) return null;

    const port = portStr ? parseInt(portStr, 10) : 587;
    const cacheKey = `${host}:${port}:${user ?? ''}:${pass ?? ''}`;
    if (this.transporterCache?.key === cacheKey) {
      return this.transporterCache.transporter;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    this.transporterCache = { key: cacheKey, transporter };
    return transporter;
  }

  async notifyDeploymentFinished(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    const [notifySuccess, notifyFailure] = await Promise.all([
      this.getConfig(NOTIFY_ON_SUCCESS_KEY),
      this.getConfig(NOTIFY_ON_FAILURE_KEY),
    ]);

    const shouldNotifySuccess = notifySuccess !== 'false';
    const shouldNotifyFailure = notifyFailure !== 'false';

    if (payload.status === 'SUCCESS' && !shouldNotifySuccess) return;
    if (
      (payload.status === 'FAILED' || payload.status === 'CANCELED') &&
      !shouldNotifyFailure
    )
      return;

    await Promise.allSettled([
      this.sendSlackNotification(payload),
      this.sendEmailNotification(payload),
    ]);
  }

  /**
   * Fired by the DockerConnectionHealthService on reachable → unreachable
   * transition. Uses the same Slack + email channels as deployment
   * notifications, with a different template (server name, endpoint, error).
   */
  async notifyDockerConnectionDown(
    payload: DockerConnectionDownPayload,
  ): Promise<void> {
    await Promise.allSettled([
      this.sendDockerConnectionSlackNotification(payload, false),
      this.sendDockerConnectionEmailNotification(payload, false),
    ]);
  }

  /**
   * Fired by the DockerConnectionHealthService on unreachable → reachable
   * transition (recovery). Same channels, recovery template.
   */
  async notifyDockerConnectionRecovered(
    payload: DockerConnectionRecoveredPayload,
  ): Promise<void> {
    await Promise.allSettled([
      this.sendDockerConnectionSlackNotification(payload, true),
      this.sendDockerConnectionEmailNotification(payload, true),
    ]);
  }

  /**
   * Fired by the ReconcilerService when it auto-heals a crashed container.
   */
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
      this.sendSimpleSlack(text),
      this.sendSimpleEmail('Auto-heal', text, payload.containerName),
    ]);
  }

  /**
   * Fired by WebhookRetryService when an event exhausts its retries and is
   * dead-lettered. Tells the admin the push will NOT auto-deploy and that a
   * manual replay is available in the UI.
   */
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
      this.sendSimpleSlack(text),
      this.sendSimpleEmail('Webhook mort-lettre', text, projectName),
    ]);
  }

  /**
   * B-9 fix: Fired by SslRenewalService when a certificate renewal fails.
   * Alerts via the same Slack + email channels so the ops team can act before
   * the certificate actually expires.
   */
  async notifySslRenewalFailed(payload: {
    domainName: string;
    error: string;
  }): Promise<void> {
    const text =
      `🔒 SSL renewal failed for domain \`${payload.domainName}\`. ` +
      `Error: ${payload.error}. ` +
      `Manual renewal may be required before the certificate expires.`;
    await Promise.allSettled([
      this.sendSimpleSlack(text),
      this.sendSimpleEmail('SSL Renewal Failed', text, payload.domainName),
    ]);
  }

  /** Minimal Slack post for non-deployment alerts (dead-letter, etc.). */
  private async sendSimpleSlack(text: string): Promise<void> {
    try {
      const webhookUrl = await this.getConfig(SLACK_WEBHOOK_KEY);
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

  /** Minimal email for non-deployment alerts; no-op when SMTP is not configured. */
  private async sendSimpleEmail(
    subject: string,
    text: string,
    projectName: string,
  ): Promise<void> {
    try {
      const [transporter, from, to] = await Promise.all([
        this.getTransporter(),
        this.getConfig(SMTP_FROM_KEY),
        this.getConfig(SMTP_TO_KEY),
      ]);
      if (!transporter || !to) return;
      await transporter.sendMail({
        from: from ?? 'noreply@platform.local',
        to,
        subject: `[Platform] ${subject} — ${escapeHtml(projectName)}`,
        text,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Email alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async sendSlackNotification(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    try {
      const webhookUrl = await this.getConfig(SLACK_WEBHOOK_KEY);
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

  private async sendEmailNotification(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    try {
      const [transporter, from, to] = await Promise.all([
        this.getTransporter(),
        this.getConfig(SMTP_FROM_KEY),
        this.getConfig(SMTP_TO_KEY),
      ]);

      if (!transporter || !to) return;

      const user = await this.getConfig(SMTP_USER_KEY);

      const emoji =
        payload.status === 'SUCCESS'
          ? '✅'
          : payload.status === 'FAILED'
            ? '❌'
            : '⛔';
      const subject = `${emoji} Déploiement ${payload.status} — ${payload.projectName}`;

      const html = `
        <h2>${emoji} Déploiement ${escapeHtml(payload.status)}</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:6px 12px;font-weight:bold">Projet</td><td style="padding:6px 12px">${escapeHtml(payload.projectName)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Environnement</td><td style="padding:6px 12px">${escapeHtml(payload.environmentName)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Branche</td><td style="padding:6px 12px">${escapeHtml(payload.branch)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Déclenché par</td><td style="padding:6px 12px">${escapeHtml(payload.triggeredBy)}</td></tr>
          ${payload.pipelineUrl ? `<tr><td style="padding:6px 12px;font-weight:bold">Pipeline</td><td style="padding:6px 12px"><a href="${escapeHtml(payload.pipelineUrl)}">Voir sur GitLab</a></td></tr>` : ''}
        </table>
      `;

      await transporter.sendMail({
        from: from ?? user ?? undefined,
        to,
        subject,
        html,
      });
      this.logger.log(
        `Email notification sent for ${payload.deploymentId} (${payload.status})`,
      );
    } catch (err) {
      this.logger.warn(
        `Email notification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    const [
      webhookUrl,
      notifySuccess,
      notifyFailure,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      smtpFrom,
      smtpTo,
    ] = await Promise.all([
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
    const deleteIfEmpty = async (
      key: string,
      value: string | undefined,
      isSecret = false,
    ) => {
      if (typeof value === 'string') {
        if (value.trim()) await upsert(key, value.trim(), isSecret);
        else await this.prisma.platformConfig.deleteMany({ where: { key } });
      }
    };

    await Promise.all([
      deleteIfEmpty(SLACK_WEBHOOK_KEY, settings.slackWebhookUrl, true),
      ...(typeof settings.notifyOnSuccess === 'boolean'
        ? [upsert(NOTIFY_ON_SUCCESS_KEY, String(settings.notifyOnSuccess))]
        : []),
      ...(typeof settings.notifyOnFailure === 'boolean'
        ? [upsert(NOTIFY_ON_FAILURE_KEY, String(settings.notifyOnFailure))]
        : []),
      deleteIfEmpty(SMTP_HOST_KEY, settings.smtpHost),
      ...(typeof settings.smtpPort === 'number'
        ? [upsert(SMTP_PORT_KEY, String(settings.smtpPort))]
        : []),
      deleteIfEmpty(SMTP_USER_KEY, settings.smtpUser),
      deleteIfEmpty(SMTP_PASS_KEY, settings.smtpPass, true),
      deleteIfEmpty(SMTP_FROM_KEY, settings.smtpFrom),
      deleteIfEmpty(SMTP_TO_KEY, settings.smtpTo),
    ]);
  }

  private async sendDockerConnectionSlackNotification(
    payload: DockerConnectionDownPayload | DockerConnectionRecoveredPayload,
    recovered: boolean,
  ): Promise<void> {
    try {
      const webhookUrl = await this.getConfig(SLACK_WEBHOOK_KEY);
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

  private async sendDockerConnectionEmailNotification(
    payload: DockerConnectionDownPayload | DockerConnectionRecoveredPayload,
    recovered: boolean,
  ): Promise<void> {
    try {
      const [transporter, smtpFrom, smtpTo] = await Promise.all([
        this.getTransporter(),
        this.getConfig(SMTP_FROM_KEY),
        this.getConfig(SMTP_TO_KEY),
      ]);
      if (!transporter || !smtpTo) return;
      const smtpUser = await this.getConfig(SMTP_USER_KEY);
      const isDown = !recovered;
      const emoji = isDown ? '🔴' : '🟢';
      const verb = isDown ? 'INJOIGNABLE' : 'RÉCUPÉRÉ';
      const downPayload = payload as DockerConnectionDownPayload;
      const serverLabel = escapeHtml(
        downPayload.serverName ?? downPayload.serverId,
      );
      const subject = `${emoji} Docker ${verb} — ${serverLabel}`;
      const html = `
        <h2>${emoji} Connexion Docker ${verb}</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:6px 12px;font-weight:bold">Serveur</td><td style="padding:6px 12px">${serverLabel}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold">Endpoint</td><td style="padding:6px 12px">${escapeHtml(payload.endpoint)}</td></tr>
          ${isDown ? `<tr><td style="padding:6px 12px;font-weight:bold">Erreur</td><td style="padding:6px 12px"><code>${escapeHtml(downPayload.lastError.slice(0, 1000))}</code></td></tr>` : ''}
        </table>
      `;
      const from = smtpFrom ?? smtpUser ?? 'noreply@platform.local';
      await transporter.sendMail({ from, to: smtpTo, subject, html });
    } catch (err) {
      this.logger.warn(
        `Docker connection email notification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
