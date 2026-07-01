import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnsibleRunnerService } from '../../../adapters/provisioning/ansible-runner.service';
import { ProjectAccessService } from '../../catalog/access/project-access.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { SslCertificateService, SslCertificateRequest } from './ssl-certificate.service';

function makeSvc(opts: {
  server?: unknown;
  cert?: unknown;
  certs?: unknown[];
} = {}) {
  const prisma = {
    server: {
      findUnique: jest.fn().mockResolvedValue(
        'server' in opts ? opts.server : { environment: { projectId: 'proj1' } },
      ),
    },
    sslCertificate: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(
        'cert' in opts ? opts.cert : {
          domainName: 'example.com',
          domain: { projectId: 'proj1', serviceEnv: null },
        },
      ),
      findMany: jest.fn().mockResolvedValue(opts.certs ?? []),
    },
  } as unknown as PrismaService;

  const projectAccess = {
    assertCanManageProject: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectAccessService;

  const ansibleRunner = {
    resolvePlaybooksRoot: jest.fn().mockReturnValue('/playbooks'),
    runPlaybook: jest.fn().mockResolvedValue(undefined),
  } as unknown as AnsibleRunnerService;

  const svc = new SslCertificateService(prisma, projectAccess, ansibleRunner);
  return { svc, prisma, projectAccess, ansibleRunner };
}

const request: SslCertificateRequest = {
  domainId: 'dom1',
  domainName: 'example.com',
  serverId: 's1',
  serverHost: '10.0.0.1',
  applicationPort: 3000,
  email: 'admin@example.com',
};

describe('SslCertificateService', () => {
  describe('issueAndConfigure', () => {
    it('throws NotFoundException when server has no environment', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(
        svc.issueAndConfigure(request, 'u1', Role.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('checks manage access before running the playbook', async () => {
      const { svc, projectAccess } = makeSvc();
      await svc.issueAndConfigure(request, 'u1', Role.OWNER);
      expect(projectAccess.assertCanManageProject).toHaveBeenCalledWith(
        'proj1',
        'u1',
        Role.OWNER,
      );
    });

    it('runs the ssl-certbot.yml playbook with correct extra-vars', async () => {
      const { svc, ansibleRunner } = makeSvc();
      await svc.issueAndConfigure(request, 'u1', Role.ADMIN);
      const args: string[] = (ansibleRunner.runPlaybook as jest.Mock).mock.calls[0][0];
      expect(args[0]).toContain('ssl-certbot.yml');
      const extraVars = JSON.parse(args[args.indexOf('--extra-vars') + 1]) as {
        domain_name: string;
        certbot_email: string;
      };
      expect(extraVars.domain_name).toBe('example.com');
      expect(extraVars.certbot_email).toBe('admin@example.com');
    });

    it('upserts a certificate record in DB after playbook success', async () => {
      const { svc, prisma } = makeSvc();
      await svc.issueAndConfigure(request, 'u1', Role.ADMIN);
      expect(prisma.sslCertificate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { domainName: 'example.com' },
          create: expect.objectContaining({ domainName: 'example.com', autoRenewal: true }),
        }),
      );
    });

    it('returns a SslCertificateResult with correct paths', async () => {
      const { svc } = makeSvc();
      const result = await svc.issueAndConfigure(request, 'u1', Role.ADMIN);
      expect(result.domain).toBe('example.com');
      expect(result.certificatePath).toContain('fullchain.pem');
      expect(result.keyPath).toContain('privkey.pem');
      expect(result.autoRenewal).toBe(true);
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when certificate not found', async () => {
      const { svc } = makeSvc({ cert: null });
      await expect(svc.revoke('missing.com', 'u1', Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('runs the ssl-revoke.yml playbook', async () => {
      const { svc, ansibleRunner } = makeSvc();
      await svc.revoke('example.com', 'u1', Role.ADMIN);
      const args: string[] = (ansibleRunner.runPlaybook as jest.Mock).mock.calls[0][0];
      expect(args[0]).toContain('ssl-revoke.yml');
    });

    it('checks manage access when cert has a projectId', async () => {
      const { svc, projectAccess } = makeSvc();
      await svc.revoke('example.com', 'u1', Role.OWNER);
      expect(projectAccess.assertCanManageProject).toHaveBeenCalledWith(
        'proj1',
        'u1',
        Role.OWNER,
      );
    });

    it('resolves projectId from serviceEnv when domain.projectId is null', async () => {
      const { svc, projectAccess } = makeSvc({
        cert: {
          domainName: 'api.example.com',
          domain: {
            projectId: null,
            serviceEnv: { environment: { projectId: 'proj-from-env' } },
          },
        },
      });
      await svc.revoke('api.example.com', 'u1', Role.OWNER);
      expect(projectAccess.assertCanManageProject).toHaveBeenCalledWith(
        'proj-from-env',
        'u1',
        Role.OWNER,
      );
    });
  });

  describe('getExpiringCertificates', () => {
    it('returns certs expiring within the given days window', async () => {
      const now = new Date();
      const { svc, prisma } = makeSvc({
        certs: [{ domainName: 'exp.com', expiresAt: new Date(now.getTime() + 10 * 86400000) }],
      });
      const result = await svc.getExpiringCertificates(30);
      expect(result).toHaveLength(1);
      const call = (prisma.sslCertificate.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.autoRenewal).toBe(true);
      const threshold: Date = call.where.expiresAt.lt;
      const expectedThresholdMs = 30 * 86400000;
      expect(threshold.getTime() - Date.now()).toBeGreaterThan(expectedThresholdMs - 2000);
    });

    it('uses 30 days as the default window', async () => {
      const { svc } = makeSvc({ certs: [] });
      const result = await svc.getExpiringCertificates();
      expect(result).toHaveLength(0);
    });
  });
});
