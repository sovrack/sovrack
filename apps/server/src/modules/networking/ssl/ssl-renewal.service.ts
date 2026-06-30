import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SslCertificateService } from './ssl-certificate.service';
import { AnsibleRunnerService } from '../../../adapters/provisioning/ansible-runner.service';
import { NotificationsService } from '../../notifications/notifications.service';

/**
 * Scheduled SSL certificate renewal service.
 * Runs daily to detect and renew certificates expiring within 30 days.
 */
@Injectable()
export class SslRenewalService {
  private readonly logger = new Logger(SslRenewalService.name);

  constructor(
    private readonly sslCertificateService: SslCertificateService,
    private readonly ansibleRunner: AnsibleRunnerService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async renewExpiringCertificates(): Promise<void> {
    this.logger.log('Running scheduled SSL certificate renewal check...');

    const expiring =
      await this.sslCertificateService.getExpiringCertificates(30);

    if (expiring.length === 0) {
      this.logger.log('No certificates expiring within 30 days.');
      return;
    }

    this.logger.log(`Found ${expiring.length} certificate(s) to renew.`);

    for (const cert of expiring) {
      try {
        await this.renewCertificate(cert.domainName);
        this.logger.log(
          `Successfully renewed certificate for: ${cert.domainName}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to renew certificate for ${cert.domainName}: ${message}`,
        );
        await this.notifications
          .notifySslRenewalFailed({
            domainName: cert.domainName,
            error: message,
          })
          .catch(() => {});
      }
    }
  }

  private async renewCertificate(domainName: string): Promise<void> {
    const playbookRoot = this.ansibleRunner.resolvePlaybooksRoot();

    const renewAbort = new AbortController();
    const renewTimeout = setTimeout(() => renewAbort.abort(), 120_000);
    try {
      await this.ansibleRunner.runPlaybook(
        [
          `${playbookRoot}/ssl-renew.yml`,
          '--extra-vars',
          JSON.stringify({ domain_name: domainName }),
        ],
        { cwd: playbookRoot, extraEnv: {} },
        { signal: renewAbort.signal, timeoutMs: 120_000 },
      );
    } finally {
      clearTimeout(renewTimeout);
    }
  }
}
