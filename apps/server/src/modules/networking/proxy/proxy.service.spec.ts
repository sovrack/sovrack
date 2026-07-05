import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { ProjectAccessService } from '../../catalog/authorization/project-access.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProxyService } from './proxy.service';

function makeAccess() {
  return {
    assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
    assertCanManageProject: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProjectAccessService;
}

function makePrisma(
  overrides: {
    server?: unknown;
    proxyRule?: unknown;
    proxyRules?: unknown[];
    domain?: unknown;
  } = {},
) {
  const defaultServer = {
    environment: { projectId: 'proj1' },
  };
  const defaultRule = {
    id: 'rule1',
    domain: 'example.com',
    isActive: true,
    server: { environment: { projectId: 'proj1' } },
  };

  return {
    server: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          'server' in overrides ? overrides.server : defaultServer,
        ),
    },
    proxyRule: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          'proxyRule' in overrides ? overrides.proxyRule : defaultRule,
        ),
      findMany: jest
        .fn()
        .mockResolvedValue(overrides.proxyRules ?? [defaultRule]),
      create: jest.fn().mockResolvedValue(defaultRule),
      update: jest.fn().mockResolvedValue({ ...defaultRule, targetPort: 8080 }),
      delete: jest.fn().mockResolvedValue(defaultRule),
    },
    domain: {
      findFirst: jest
        .fn()
        .mockResolvedValue('domain' in overrides ? overrides.domain : null),
    },
  } as unknown as PrismaService;
}

function makeSvc(
  prismaOverrides = {},
  accessOverrides?: Partial<ProjectAccessService>,
) {
  const prisma = makePrisma(prismaOverrides);
  const access = {
    ...makeAccess(),
    ...accessOverrides,
  } as ProjectAccessService;
  const svc = new ProxyService(prisma, access);
  return { svc, prisma, access };
}

describe('ProxyService', () => {
  describe('findAll', () => {
    it('returns rules without access check when no serverId filter', async () => {
      const { svc, access } = makeSvc();
      await svc.findAll({}, 'u1', Role.USER);
      expect(access.assertCanAccessProject).not.toHaveBeenCalled();
    });

    it('checks access when serverId filter is provided', async () => {
      const { svc, access } = makeSvc();
      await svc.findAll({ serverId: 's1' }, 'u1', Role.USER);
      expect(access.assertCanAccessProject).toHaveBeenCalledWith(
        'proj1',
        'u1',
        Role.USER,
      );
    });

    it('throws NotFoundException when server has no environment', async () => {
      const { svc } = makeSvc({ server: null });
      await expect(
        svc.findAll({ serverId: 's1' }, 'u1', Role.USER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when rule not found', async () => {
      const { svc } = makeSvc({ proxyRule: null });
      await expect(svc.findOne('missing', 'u1', Role.USER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the rule for authorized user', async () => {
      const { svc } = makeSvc();
      const rule = await svc.findOne('rule1', 'u1', Role.USER);
      expect(rule.id).toBe('rule1');
    });
  });

  describe('create', () => {
    it('creates a proxy rule and returns it', async () => {
      const { svc } = makeSvc();
      const dto = {
        serverId: 's1',
        domain: 'example.com',
        targetPort: 3000,
        sslEnabled: true,
      };
      const result = await svc.create(dto as never, 'u1', Role.OWNER);
      expect(result.id).toBe('rule1');
    });

    it('checks manage access before creating', async () => {
      const { svc, access } = makeSvc();
      await svc.create(
        { serverId: 's1', domain: 'x.com', targetPort: 80 } as never,
        'u1',
        Role.OWNER,
      );
      expect(access.assertCanManageProject).toHaveBeenCalledWith(
        'proj1',
        'u1',
        Role.OWNER,
      );
    });

    it('throws ConflictException on P2002 duplicate domain', async () => {
      const { svc, prisma } = makeSvc();
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      (prisma.proxyRule.create as jest.Mock).mockRejectedValue(p2002);
      await expect(
        svc.create(
          { serverId: 's1', domain: 'dup.com', targetPort: 80 } as never,
          'u1',
          Role.OWNER,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unknown errors from create', async () => {
      const { svc, prisma } = makeSvc();
      (prisma.proxyRule.create as jest.Mock).mockRejectedValue(
        new Error('db error'),
      );
      await expect(
        svc.create(
          { serverId: 's1', domain: 'x.com', targetPort: 80 } as never,
          'u1',
          Role.OWNER,
        ),
      ).rejects.toThrow('db error');
    });
  });

  describe('update', () => {
    it('updates the rule after access check', async () => {
      const { svc, access } = makeSvc();
      await svc.update('rule1', { targetPort: 8080 }, 'u1', Role.OWNER);
      expect(access.assertCanManageProject).toHaveBeenCalledWith(
        'proj1',
        'u1',
        Role.OWNER,
      );
    });
  });

  describe('remove', () => {
    it('deletes the rule after access check', async () => {
      const { svc, prisma, access } = makeSvc();
      await svc.remove('rule1', 'u1', Role.OWNER);
      expect(access.assertCanManageProject).toHaveBeenCalled();
      expect(prisma.proxyRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule1' },
      });
    });
  });

  describe('toggleActive', () => {
    it('flips isActive from true to false', async () => {
      const { svc, prisma } = makeSvc();
      await svc.toggleActive('rule1', 'u1', Role.OWNER);
      expect(prisma.proxyRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });

    it('flips isActive from false to true', async () => {
      const { svc, prisma } = makeSvc({
        proxyRule: {
          id: 'rule1',
          domain: 'example.com',
          isActive: false,
          server: { environment: { projectId: 'proj1' } },
        },
      });
      await svc.toggleActive('rule1', 'u1', Role.OWNER);
      expect(prisma.proxyRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: true } }),
      );
    });
  });
});
