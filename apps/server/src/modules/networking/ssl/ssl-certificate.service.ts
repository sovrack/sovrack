import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AnsibleRunnerService } from '../../../adapters/provisioning/ansible-runner.service';

export type SslCertificateRequest = {
  domainId: string;
  domainName: string;
  serverId: string;
  serverHost: string;
  applicationPort: number;
  email: string;
};

export type SslCertificateResult = {
  domain: string;
  certificatePath: string;
  keyPath: string;
  expiresAt: Date;
  autoRenewal: boolean;
};

/**
 * Manages SSL/TLS certificate lifecycle:
 * - Issues Let's Encrypt certificates via Ansible certbot role
 * - Configures Nginx SSL proxy
 * - Tracks certificate metadata in DB
 */
@Injectable()
export class SslCertificateService {
  private readonly logger = new Logger(SslCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ansibleRunner: AnsibleRunnerService,
  ) {}

  async issueAndConfigure(
    request: SslCertificateRequest,
  ): Promise<SslCertificateResult> {
    this.logger.log(
      `Issuing SSL certificate for domain: ${request.domainName}`,
    );

    const playbookRoot = this.ansibleRunner.resolvePlaybooksRoot();

    await this.ansibleRunner.runPlaybook(
      [
        `${playbookRoot}/ssl-certbot.yml`,
        '--extra-vars',
        JSON.stringify({
          domain_name: request.domainName,
          certbot_email: request.email,
          app_port: request.applicationPort,
          server_host: request.serverHost,
        }),
      ],
      { cwd: playbookRoot, extraEnv: {} },
      { signal: new AbortController().signal, timeoutMs: 120_000 },
    );

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const certificatePath = `/etc/letsencrypt/live/${request.domainName}/fullchain.pem`;
    const keyPath = `/etc/letsencrypt/live/${request.domainName}/privkey.pem`;

    await this.prisma.sslCertificate.upsert({
      where: { domainName: request.domainName },
      create: {
        domainId: request.domainId,
        domainName: request.domainName,
        certificatePath,
        keyPath,
        expiresAt,
        autoRenewal: true,
      },
      update: {
        expiresAt,
        autoRenewal: true,
      },
    });

    return {
      domain: request.domainName,
      certificatePath: `/etc/letsencrypt/live/${request.domainName}/fullchain.pem`,
      keyPath: `/etc/letsencrypt/live/${request.domainName}/privkey.pem`,
      expiresAt,
      autoRenewal: true,
    };
  }

  async revoke(domainName: string): Promise<void> {
    this.logger.log(`Revoking SSL certificate for domain: ${domainName}`);

    const playbookRoot = this.ansibleRunner.resolvePlaybooksRoot();

    await this.ansibleRunner.runPlaybook(
      [
        `${playbookRoot}/ssl-revoke.yml`,
        '--extra-vars',
        JSON.stringify({ domain_name: domainName }),
      ],
      { cwd: playbookRoot, extraEnv: {} },
      { signal: new AbortController().signal, timeoutMs: 60_000 },
    );
  }

  async getExpiringCertificates(
    withinDays = 30,
  ): Promise<Array<{ domainName: string; expiresAt: Date }>> {
    const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return this.prisma.sslCertificate.findMany({
      where: { expiresAt: { lt: threshold }, autoRenewal: true },
      orderBy: { expiresAt: 'asc' },
      select: { domainName: true, expiresAt: true },
    });
  }
}
