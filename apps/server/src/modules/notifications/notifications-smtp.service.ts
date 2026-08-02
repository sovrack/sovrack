import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  NotificationsConfigService,
  CONFIG_KEYS,
} from './notifications-config.service';
import type {
  DeploymentNotificationPayload,
  DockerConnectionDownPayload,
  DockerConnectionRecoveredPayload,
} from './notifications-payloads.types';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class NotificationsSmtpService {
  private readonly logger = new Logger(NotificationsSmtpService.name);

  private transporterCache: {
    key: string;
    transporter: ReturnType<typeof nodemailer.createTransport>;
  } | null = null;

  constructor(private readonly config: NotificationsConfigService) {}

  private async getTransporter(): Promise<ReturnType<
    typeof nodemailer.createTransport
  > | null> {
    const K = CONFIG_KEYS;
    const [host, portStr, user, pass] = await Promise.all([
      this.config.get(K.SMTP_HOST),
      this.config.get(K.SMTP_PORT),
      this.config.get(K.SMTP_USER),
      this.config.get(K.SMTP_PASS),
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

  async sendSimpleEmail(
    subject: string,
    text: string,
    contextLabel: string,
  ): Promise<void> {
    try {
      const K = CONFIG_KEYS;
      const [transporter, from, to] = await Promise.all([
        this.getTransporter(),
        this.config.get(K.SMTP_FROM),
        this.config.get(K.SMTP_TO),
      ]);
      if (!transporter || !to) return;
      await transporter.sendMail({
        from: from ?? 'noreply@platform.local',
        to,
        subject: `[Platform] ${subject} — ${escapeHtml(contextLabel)}`,
        text,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Email alert failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async sendBillingEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    try {
      const K = CONFIG_KEYS;
      const [transporter, from] = await Promise.all([
        this.getTransporter(),
        this.config.get(K.SMTP_FROM),
      ]);
      if (!transporter) return;
      await transporter.sendMail({
        from: from ?? 'billing@sovrack.tn',
        to,
        subject: `[Sovrack] ${subject}`,
        html,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Billing email failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async sendDeploymentEmail(
    payload: DeploymentNotificationPayload,
  ): Promise<void> {
    try {
      const K = CONFIG_KEYS;
      const [transporter, from, to] = await Promise.all([
        this.getTransporter(),
        this.config.get(K.SMTP_FROM),
        this.config.get(K.SMTP_TO),
      ]);
      if (!transporter || !to) return;

      const user = await this.config.get(K.SMTP_USER);
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

  async sendDockerConnectionEmail(
    payload: DockerConnectionDownPayload | DockerConnectionRecoveredPayload,
    recovered: boolean,
  ): Promise<void> {
    try {
      const K = CONFIG_KEYS;
      const [transporter, smtpFrom, smtpTo] = await Promise.all([
        this.getTransporter(),
        this.config.get(K.SMTP_FROM),
        this.config.get(K.SMTP_TO),
      ]);
      if (!transporter || !smtpTo) return;
      const smtpUser = await this.config.get(K.SMTP_USER);
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
