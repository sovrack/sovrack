import { NotFoundException } from '@nestjs/common';
import { Role, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import {
  DeploymentsQueryService,
  type DeploymentWithRelations,
} from './deployments-query.service';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';

describe('DeploymentsQueryService', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    deployment: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
  };
  let auth: { assertCanAccessProject: jest.Mock };
  let crypto: { decryptSafe: jest.Mock };
  let workspaceAccess: {
    resolveWorkspaceId: jest.Mock;
    assertWorkspaceAction: jest.Mock;
  };
  let service: DeploymentsQueryService;

  beforeEach(() => {
    prisma = {
      serviceEnvironment: { findUnique: jest.fn() },
      deployment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    auth = { assertCanAccessProject: jest.fn().mockResolvedValue(undefined) };
    crypto = { decryptSafe: jest.fn((v: string | null) => v) };
    workspaceAccess = {
      resolveWorkspaceId: jest.fn().mockResolvedValue('workspace-1'),
      assertWorkspaceAction: jest.fn().mockResolvedValue({
        workspaceId: 'workspace-1',
        userId: 'u1',
        workspaceRole: WorkspaceRole.MEMBER,
      }),
    };
    service = new DeploymentsQueryService(
      prisma as unknown as PrismaService,
      auth as unknown as DeploymentsAuthorizationService,
      crypto as unknown as CryptoService,
      workspaceAccess as unknown as WorkspaceAccessService,
    );
  });

  describe('previewEnv', () => {
    it('resolves variables and masks secret values', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue({
        env: '{"PUBLIC":"1"}',
        secretsEnv: '{"TOKEN":"abc"}',
        service: { env: null, secretsEnv: null, projectId: 'proj-1' },
        environment: { env: null, secretsEnv: null, projectId: 'proj-1' },
      });
      const preview = await service.previewEnv('se1', 'user-1', Role.OWNER);
      const token = preview.variables.find((v) => v.key === 'TOKEN');
      const pub = preview.variables.find((v) => v.key === 'PUBLIC');
      expect(token?.isSecret).toBe(true);
      expect(token?.value).toBe('[REDACTED]');
      expect(pub?.value).toBe('1');
    });

    it('404s for an unknown service-environment', async () => {
      prisma.serviceEnvironment.findUnique.mockResolvedValue(null);
      await expect(
        service.previewEnv('nope', 'user-1', Role.OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('computePublicUrl', () => {
    const dep = (over: Record<string, unknown>) =>
      ({
        service: { port: 3000 },
        serviceEnv: {},
        ...over,
      }) as unknown as DeploymentWithRelations;

    it('prefers an attached domain (https)', () => {
      const url = service.computePublicUrl(
        dep({ serviceEnv: { domains: [{ name: 'app.example.com' }] } }),
      );
      expect(url).toBe('https://app.example.com');
    });

    it('falls back to the env server host:port (http)', () => {
      const url = service.computePublicUrl(
        dep({
          serviceEnv: { environment: { servers: [{ host: '10.0.0.1' }] } },
        }),
      );
      expect(url).toBe('http://10.0.0.1:3000');
    });

    it('returns null when nothing resolves', () => {
      expect(service.computePublicUrl(dep({ serviceEnv: {} }))).toBeNull();
    });
  });

  describe('findAll', () => {
    it('scopes a workspace admin to every deployment in that workspace', async () => {
      workspaceAccess.assertWorkspaceAction.mockResolvedValueOnce({
        workspaceId: 'workspace-1',
        userId: 'admin',
        workspaceRole: WorkspaceRole.ADMIN,
      });
      await service.findAll('admin', Role.OWNER);
      expect(prisma.deployment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project: { teamId: 'workspace-1' } },
        }),
      );
    });

    it('filters by membership for a non-admin', async () => {
      await service.findAll('u1', Role.MEMBER);
      expect(prisma.deployment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            project: {
              teamId: 'workspace-1',
              members: { some: { userId: 'u1' } },
            },
          },
        }),
      );
    });

    it('paginates when page+limit are provided', async () => {
      const res = await service.findAll('admin', Role.OWNER, {
        page: 1,
        limit: 10,
      });
      expect(prisma.deployment.count).toHaveBeenCalled();
      expect(res).toHaveProperty('data');
    });
  });

  describe('findOne', () => {
    it('404s and enforces project access', async () => {
      prisma.deployment.findUnique.mockResolvedValue(null);
      await expect(
        service.findOne('nope', 'u1', Role.OWNER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns an enriched deployment with publicUrl', async () => {
      prisma.deployment.findUnique.mockResolvedValue({
        id: 'd1',
        projectId: 'p1',
        service: { port: 3000 },
        serviceEnv: { domains: [{ name: 'x.com' }] },
      });
      const res = await service.findOne('d1', 'u1', Role.OWNER);
      expect(auth.assertCanAccessProject).toHaveBeenCalledWith(
        'p1',
        'u1',
        Role.OWNER,
      );
      expect(res.publicUrl).toBe('https://x.com');
    });
  });
});
