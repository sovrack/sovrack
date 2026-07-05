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
  let ssh: { mapConnectionMode: jest.Mock; pingReachable: jest.Mock };
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
    ssh = {
      mapConnectionMode: jest.fn().mockReturnValue('SSH_KEY'),
      pingReachable: jest.fn().mockResolvedValue(true),
    };
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

  // A1 (edit server SSH credentials) — the previous update() path only called
  // encrypt(normalizePrivateKeyFormat(dto.sshKey)), never re-deriving
  // sshPublicKey — which would silently leave ServerKeyInstallDialog showing
  // the OLD public key after a credential change (it reads Server.sshPublicKey).
  it('update() with a raw sshKey re-derives and stores BOTH the private and public key', async () => {
    await service.update('s1', { sshKey: 'new-raw-key' } as never, 'admin');
    expect(crypto.resolveSshMaterial).toHaveBeenCalledWith('new-raw-key');
    expect(prisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sshKey: 'enc:priv',
          sshPublicKey: 'pub',
          isVerified: false,
          status: ServerStatus.NEW,
        }),
      }),
    );
  });

  it('update() resolves sshKeyId the same way create() does (decrypt then re-derive)', async () => {
    prisma.sshKey.findUnique.mockResolvedValue({
      encryptedPrivateKey: 'stored-enc',
    });
    await service.update('s1', { sshKeyId: 'k1' } as never, 'admin');
    expect(crypto.decrypt).toHaveBeenCalledWith('stored-enc');
    expect(crypto.resolveSshMaterial).toHaveBeenCalledWith('dec:stored-enc');
    expect(prisma.server.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sshKey: 'enc:priv',
          sshPublicKey: 'pub',
        }),
      }),
    );
  });

  it('update() rejects a missing stored SSH key referenced by sshKeyId', async () => {
    prisma.sshKey.findUnique.mockResolvedValue(null);
    await expect(
      service.update('s1', { sshKeyId: 'ghost' } as never, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update() without sshKey/sshKeyId never touches the stored credential (never overwrites with empty)', async () => {
    await service.update('s1', { name: 'renamed' } as never, 'admin');
    expect(crypto.resolveSshMaterial).not.toHaveBeenCalled();
    const data = prisma.server.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('sshKey');
    expect(data).not.toHaveProperty('sshPublicKey');
    // A name-only change must not force re-verification either.
    expect(data).not.toHaveProperty('isVerified');
  });

  // A3: reachability polling — pings every active server's host:port and
  // returns a plain id → boolean map. Deliberately distinct from
  // isVerified/status (no state mutation, no persistence, no server lookup
  // by id — just the raw ping).
  describe('pingAll', () => {
    it('pings every active server and maps the result by id', async () => {
      prisma.server.findMany.mockResolvedValue([
        { id: 's1', host: 'h1', port: 22 },
        { id: 's2', host: 'h2', port: 2222 },
      ]);
      ssh.pingReachable
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.pingAll();

      expect(ssh.pingReachable).toHaveBeenNthCalledWith(1, 'h1', 22);
      expect(ssh.pingReachable).toHaveBeenNthCalledWith(2, 'h2', 2222);
      expect(result).toEqual({ s1: true, s2: false });
    });
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
