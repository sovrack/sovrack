import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from './servers-audit.service';

describe('ServersAuditService', () => {
  let prisma: { auditLog: { create: jest.Mock; findMany: jest.Mock } };
  let svc: ServersAuditService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    svc = new ServersAuditService(prisma as unknown as PrismaService);
  });

  describe('record', () => {
    it('writes a SERVER audit row with actor + metadata', async () => {
      await svc.record('srv1', 'SERVER_PREPARE', 'u1', { jobId: 'j1' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resourceType: 'SERVER',
          resourceId: 'srv1',
          action: 'SERVER_PREPARE',
          userId: 'u1',
          metadata: { jobId: 'j1' },
        }),
      });
    });

    it('omits userId/metadata when not provided (system event)', async () => {
      await svc.record('srv1', 'SERVER_AUTO_HEAL');
      const data = prisma.auditLog.create.mock.calls[0][0].data;
      expect(data.userId).toBeUndefined();
      expect(data.metadata).toBeUndefined();
    });

    it('never throws — audit must not break the workflow', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('db down'));
      await expect(svc.record('srv1', 'X')).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('maps AuditLog rows to the legacy ServerAuditEvent shape', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a1',
          resourceId: 'srv1',
          userId: 'u1',
          action: 'SERVER_PREPARE',
          metadata: { k: 'v' },
          createdAt: new Date('2026-01-01'),
        },
      ]);
      const [evt] = await svc.list('srv1');
      expect(evt).toEqual({
        id: 'a1',
        serverId: 'srv1',
        actorId: 'u1',
        eventType: 'SERVER_PREPARE',
        payloadJson: { k: 'v' },
        createdAt: new Date('2026-01-01'),
      });
    });
  });
});
