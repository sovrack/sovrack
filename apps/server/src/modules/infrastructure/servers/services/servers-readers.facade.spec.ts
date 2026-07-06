import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from './servers-audit.service';
import { ServersDetectionService } from './servers-detection.service';
import { ServersVerificationService } from './servers-verification.service';
import { AuditService } from '../../../audit/audit.service';
import { ServersReadersFacade } from './servers-readers.facade';

describe('ServersReadersFacade', () => {
  function build(serverExists = true) {
    const prisma = {
      server: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            serverExists ? { id: 'srv-1', name: 'web' } : null,
          ),
        update: jest.fn().mockResolvedValue({
          id: 'srv-1',
          name: 'web',
          infraRole: 'PRODUCTION',
        }),
        findMany: jest.fn().mockResolvedValue([{ id: 'srv-1', name: 'web' }]),
      },
      container: { findMany: jest.fn().mockResolvedValue([]) },
      environment: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const audit = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as ServersAuditService;
    const detection = {
      listCapabilities: jest.fn().mockResolvedValue(['docker']),
      listInstalledTools: jest.fn().mockResolvedValue([]),
    } as unknown as ServersDetectionService;
    const verification = {
      listValidationResults: jest.fn().mockResolvedValue([]),
      resetStatus: jest.fn().mockResolvedValue(undefined),
      getRecentLogs: jest.fn().mockResolvedValue([]),
    } as unknown as ServersVerificationService;
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const facade = new ServersReadersFacade(
      prisma,
      audit,
      detection,
      verification,
      auditService,
    );
    return {
      facade,
      prisma,
      audit,
      detection,
      verification,
      auditService,
    };
  }

  describe('delegation (guarded by assertServerExists)', () => {
    it('listAuditEvents delegates after asserting the server exists', async () => {
      const { facade, audit } = build();
      await facade.listAuditEvents('srv-1');
      expect(audit.list).toHaveBeenCalledWith('srv-1');
    });

    it('throws NotFound when the server is missing', async () => {
      const { facade } = build(false);
      await expect(facade.listCapabilities('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('listCapabilities / listInstalledTools delegate to detection', async () => {
      const { facade, detection } = build();
      await facade.listCapabilities('srv-1');
      await facade.listInstalledTools('srv-1');
      expect(detection.listCapabilities).toHaveBeenCalledWith('srv-1');
      expect(detection.listInstalledTools).toHaveBeenCalledWith('srv-1');
    });

    it('verification methods delegate', async () => {
      const { facade, verification } = build();
      await facade.listValidationResults('srv-1');
      await facade.getRecentVerificationLogs('srv-1', 10);
      expect(verification.listValidationResults).toHaveBeenCalledWith('srv-1');
      expect(verification.getRecentLogs).toHaveBeenCalledWith('srv-1', 10);
    });
  });

  describe('setServerInfraRole', () => {
    it('updates the role, records an audit event, and returns the public server', async () => {
      const { facade, prisma, auditService } = build();
      const result = await facade.setServerInfraRole(
        'srv-1',
        'PRODUCTION' as never,
        'user-1',
      );
      expect(prisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv-1' },
        data: { infraRole: 'PRODUCTION' },
      });
      expect(auditService.record).toHaveBeenCalledWith(
        'user-1',
        'SERVER_SET_INFRA_ROLE',
        'Server',
        'srv-1',
        { infraRole: 'PRODUCTION' },
      );
      expect(result).toMatchObject({ id: 'srv-1' });
    });

    it('throws NotFound when the server does not exist', async () => {
      const { facade } = build(false);
      await expect(
        facade.setServerInfraRole('ghost', 'PRODUCTION' as never, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listInfraEnvironments', () => {
    it('returns STAGING/PRODUCTION servers as public shapes', async () => {
      const { facade, prisma } = build();
      const result = await facade.listInfraEnvironments();
      expect(prisma.server.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('listEnvironmentsForServer', () => {
    it('throws NotFound when the server is missing', async () => {
      const { facade } = build(false);
      await expect(
        facade.listEnvironmentsForServer('ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns [] when no containers reference an environment', async () => {
      const { facade } = build();
      const result = await facade.listEnvironmentsForServer('srv-1');
      expect(result).toEqual([]);
    });

    it('queries environments for the distinct referenced env ids', async () => {
      const { facade, prisma } = build();
      (prisma.container.findMany as jest.Mock).mockResolvedValueOnce([
        { deployment: { environmentId: 'env-1' } },
        { deployment: { environmentId: 'env-1' } },
        { deployment: { environmentId: 'env-2' } },
        { deployment: null },
      ]);
      (prisma.environment.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 'env-1' },
        { id: 'env-2' },
      ]);
      const result = await facade.listEnvironmentsForServer('srv-1');
      expect(prisma.environment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['env-1', 'env-2'] } },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
