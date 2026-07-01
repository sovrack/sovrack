import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProjectAccessService } from '../../catalog/access/project-access.service';
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
    private readonly projectAccess: ProjectAccessService,
    private readonly ansibleRunner: AnsibleRunnerService,
  ) {}

  private async resolveProjectIdFromServer(serverId: string): Promise<string> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { environment: { select: { projectId: true } } },
    });
    if (!server?.environment) {
      throw new NotFoundException(
        'Serveur introuvable ou non rattaché à un projet',
      );
    }
    return server.environment.projectId;
  }

  async issueAndConfigure(
    request: SslCertificateRequest,
    userId: string,
    userRole: Role,
  ): Promise<SslCertificateResult> {
    const projectId = await this.resolveProjectIdFromServer(request.serverId);
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    this.logger.log(
      `Issuing SSL certificate for domain: ${request.domainName}`,
    );

    const playbookRoot = this.ansibleRunner.resolvePlaybooksRoot();

    const issueAbort = new AbortController();
    const issueTimeout = setTimeout(() => issueAbort.abort(), 120_000);
    try {
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
        { signal: issueAbort.signal, timeoutMs: 120_000 },
      );
    } finally {
      clearTimeout(issueTimeout);
    }

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const liveDir = `/etc/letsencrypt/live/${request.domainName}`;
    const certificatePath = `${liveDir}/fullchain.pem`;
    const keyPath = `${liveDir}/privkey.pem`;

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
      certificatePath,
      keyPath,
      expiresAt,
      autoRenewal: true,
    };
  }

  async revoke(
    domainName: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    this.logger.log(`Revoking SSL certificate for domain: ${domainName}`);

    const certificate = await this.prisma.sslCertificate.findUnique({
      where: { domainName },
      include: {
        domain: {
          select: {
            projectId: true,
            serviceEnv: {
              include: { environment: { select: { projectId: true } } },
            },
          },
        },
      },
    });
    if (!certificate)
      throw new NotFoundException(
        'Aucun certificat SSL trouvé pour ce domaine',
      );

    const projectId =
      certificate.domain.projectId ??
      certificate.domain.serviceEnv?.environment.projectId;
    if (projectId) {
      await this.projectAccess.assertCanManageProject(
        projectId,
        userId,
        userRole,
      );
    }

    const playbookRoot = this.ansibleRunner.resolvePlaybooksRoot();

    const revokeAbort = new AbortController();
    const revokeTimeout = setTimeout(() => revokeAbort.abort(), 60_000);
    try {
      await this.ansibleRunner.runPlaybook(
        [
          `${playbookRoot}/ssl-revoke.yml`,
          '--extra-vars',
          JSON.stringify({ domain_name: domainName }),
        ],
        { cwd: playbookRoot, extraEnv: {} },
        { signal: revokeAbort.signal, timeoutMs: 60_000 },
      );
    } finally {
      clearTimeout(revokeTimeout);
    }
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
