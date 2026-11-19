import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationsConfigService } from './notifications-config.service';
import type { SmtpRuntimeConfig } from './notifications-config.service';
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

  private async getTransporter(): Promise<{
    transporter: ReturnType<typeof nodemailer.createTransport>;
    smtp: SmtpRuntimeConfig;
  } | null> {
    const smtp = await this.config.getSmtpRuntimeConfig();
    if (!smtp.enabled || !smtp.host) return null;

    const cacheKey = [
      smtp.host,
      smtp.port,
      smtp.security,
      smtp.user,
      smtp.pass,
    ].join(':');
    if (this.transporterCache?.key === cacheKey) {
      return { transporter: this.transporterCache.transporter, smtp };
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.security === 'tls',
      requireTLS: smtp.security === 'starttls',
      ignoreTLS: smtp.security === 'none',
      // A transactional flow must fail predictably when the SMTP provider is
      // unreachable. Nodemailer's long socket defaults otherwise leave an
      // HTTP signup/reset request hanging for minutes.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      ...(smtp.user && smtp.pass
        ? { auth: { user: smtp.user, pass: smtp.pass } }
        : {}),
    });
    this.transporterCache = { key: cacheKey, transporter };
    return { transporter, smtp };
  }

  /** Verify authentication/TLS, then deliver an actual staff test message. */
  async testConfiguration(to: string): Promise<void> {
    const resolved = await this.getTransporter();
    if (!resolved) {
      throw new ServiceUnavailableException(
        "Le service d'envoi d'email n'est pas configuré",
      );
    }
    try {
      await resolved.transporter.verify();
      await resolved.transporter.sendMail({
        from: resolved.smtp.from || 'noreply@sovrack.local',
        to,
        subject: '[Sovrack] Test de configuration email',
        text: 'La configuration SMTP Sovrack fonctionne correctement.',
      });
    } catch (error: unknown) {
      this.logger.error(
        `SMTP staff test failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Le test SMTP a échoué. Vérifiez le fournisseur, TLS et les identifiants.',
      );
    }
  }

  /**
   * Email required to complete a user-facing security flow (signup, reset,
   * deletion, invitation). Unlike best-effort operational notifications, this
   * method fails explicitly when SMTP is absent or rejects the message.
   */
  async sendTransactionalEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const resolved = await this.getTransporter();
    if (!resolved) {
      this.logger.error(
        'Transactional email refused: SMTP_HOST is not configured',
      );
      throw new ServiceUnavailableException(
        "Le service d'envoi d'email est temporairement indisponible. Réessayez plus tard.",
      );
    }

    try {
      await resolved.transporter.sendMail({
        from: resolved.smtp.from || 'noreply@sovrack.local',
        to,
        subject: `[Sovrack] ${subject}`,
        html,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Transactional email delivery failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ServiceUnavailableException(
        "Le service d'envoi d'email est temporairement indisponible. Réessayez plus tard.",
      );
    }
  }

  async sendSimpleEmail(
    subject: string,
    text: string,
    contextLabel: string,
  ): Promise<void> {
    try {
      const resolved = await this.getTransporter();
      if (!resolved || !resolved.smtp.to) return;
      await resolved.transporter.sendMail({
        from: resolved.smtp.from || 'noreply@platform.local',
        to: resolved.smtp.to,
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
      const resolved = await this.getTransporter();
      if (!resolved) return;
      await resolved.transporter.sendMail({
        from: resolved.smtp.from || 'contact@sovrack.com',
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
      const resolved = await this.getTransporter();
      if (!resolved || !resolved.smtp.to) return;
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
      await resolved.transporter.sendMail({
        from: resolved.smtp.from || resolved.smtp.user || undefined,
        to: resolved.smtp.to,
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
      const resolved = await this.getTransporter();
      if (!resolved || !resolved.smtp.to) return;
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
      const from =
        resolved.smtp.from || resolved.smtp.user || 'noreply@platform.local';
      await resolved.transporter.sendMail({
        from,
        to: resolved.smtp.to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.warn(
        `Docker connection email notification failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
