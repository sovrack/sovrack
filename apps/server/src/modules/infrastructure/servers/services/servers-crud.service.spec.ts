import { BadRequestException } from '@nestjs/common';
import { ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersCrudService } from './servers-crud.service';

// Moved from servers-core.service.spec.ts when the real CRUD logic was
// extracted into ServersCrudService (ServersCoreService is now a pure
// facade — see its own spec for the delegation-only coverage).
const serverRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'srv',
  host: '10.0.0.1',
  port: 22,
  username: 'root',
  sshKey: 'enc',
  sshPublicKey: 'ssh-rsa pub',
  connectionMode: 'SSH_KEY',
  status: ServerStatus.NEW,
  isActive: true,
  isVerified: false,
  archivedAt: null,
  environmentId: null,
  installedTools: [],
  capabilities: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('ServersCrudService', () => {
  let prisma: {
    server: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    environment: { findUnique: jest.Mock };
    container: { updateMany: jest.Mock };
    sshKey: { findUnique: jest.Mock };
    serverRun: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let crypto: {
    resolveSshMaterial: jest.Mock;
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };
  let ssh: { mapConnectionMode: jest.Mock };
  let jobsFacade: { loadActiveJobs: jest.Mock };
  let audit: { record: jest.Mock };
  let auditService: { record: jest.Mock };
  let service: ServersCrudService;

  beforeEach(() => {
    prisma = {
      server: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(serverRow(data))),
        findUnique: jest.fn().mockResolvedValue(serverRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue(serverRow()),
      },
      environment: {
        findUnique: jest.fn().mockResolvedValue({ name: 'prod' }),
      },
      container: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      sshKey: { findUnique: jest.fn().mockResolvedValue(null) },
      serverRun: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    crypto = {
      resolveSshMaterial: jest
        .fn()
        .mockReturnValue({ privateKey: 'priv', publicKey: 'pub' }),
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decrypt: jest.fn((v: string) => `dec:${v}`),
    };
    ssh = { mapConnectionMode: jest.fn().mockReturnValue('SSH_KEY') };
    jobsFacade = { loadActiveJobs: jest.fn().mockResolvedValue(new Map()) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };

    service = new ServersCrudService(
      prisma as unknown as PrismaService,
      crypto as never,
      ssh as never,
      jobsFacade as never,
      audit as never,
      auditService as never,
    );
  });

  it('creates a server with an encrypted SSH key and audits it (status NEW)', async () => {
    const res = await service.create(
      { name: 'srv', host: '10.0.0.1', sshKey: 'raw-key' } as never,
      'admin',
    );
    expect(crypto.encrypt).toHaveBeenCalledWith('priv');
    expect(prisma.server.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ServerStatus.NEW,
          sshKey: 'enc:priv',
        }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      'admin',
      'SERVER_CREATE',
      'Server',
      res.id,
      expect.anything(),
    );
  });

  it('rejects creation referencing a missing stored SSH key', async () => {
    prisma.sshKey.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        { name: 'srv', host: 'h', sshKeyId: 'ghost' } as never,
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('decrypts a referenced stored SSH key before use', async () => {
    prisma.sshKey.findUnique.mockResolvedValue({
      encryptedPrivateKey: 'stored-enc',
    });
    await service.create(
      { name: 'srv', host: 'h', sshKeyId: 'k1' } as never,
      'admin',
    );
    expect(crypto.decrypt).toHaveBeenCalledWith('stored-enc');
  });

  it('blocks removing the LAST server of an environment (anti-orphaning)', async () => {
    prisma.server.findUnique.mockResolvedValue(
      serverRow({ environmentId: 'env1' }),
    );
    prisma.server.count.mockResolvedValue(0); // no other active server
    await expect(service.remove('s1', 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('soft-deletes (archives) a server when removal is allowed', async () => {
    prisma.server.findUnique.mockResolvedValue(
      serverRow({ environmentId: 'env1' }),
    );
    prisma.server.count.mockResolvedValue(1); // a backup server exists
    await service.remove('s1', 'admin');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      'admin',
      'SERVER_DELETE',
      'Server',
      's1',
    );
  });

  it('findAll enriches results with active jobs (the piece ServersCoreService still needs jobsFacade for)', async () => {
    prisma.server.findMany.mockResolvedValue([serverRow()]);
    jobsFacade.loadActiveJobs.mockResolvedValue(
      new Map([['s1', { id: 'job1' }]]),
    );
    const res = await service.findAll();
    expect(jobsFacade.loadActiveJobs).toHaveBeenCalledWith(['s1']);
    expect(Array.isArray(res)).toBe(true);
  });
});
