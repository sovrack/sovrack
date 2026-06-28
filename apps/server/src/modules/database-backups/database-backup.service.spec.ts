import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BackupStatus,
  BackupStorageProvider,
  ContainerStatus,
  ManagedServiceType,
  Role,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { gzipSync } from 'zlib';
import { PrismaService } from '../../shared/database/prisma.service';
import { DockerApiService } from '../../adapters/container-runtime/docker-api.service';
import { PlatformService } from '../platform/platform.service';
import { DatabaseBackupService } from './database-backup.service';
import { BackupStorageService } from './backup-storage.service';

describe('DatabaseBackupService', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    container: { findFirst: jest.Mock };
    databaseBackup: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
    projectMember: { findUnique: jest.Mock };
  };
  let docker: { execCapture: jest.Mock; execWithInput: jest.Mock };
  let storage: { upload: jest.Mock; download: jest.Mock };
  let service: DatabaseBackupService;

  beforeEach(() => {
    prisma = {
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'env-1',
          service: {
            databaseType: ManagedServiceType.POSTGRES,
            projectId: 'p1',
          },
        }),
      },
      container: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ serverId: 'srv-1', name: 'db-env-1' }),
      },
      databaseBackup: {
        create: jest.fn().mockResolvedValue({ id: 'bk-1' }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'bk-1', ...data }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
      projectMember: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
    };
    docker = { execCapture: jest.fn(), execWithInput: jest.fn() };
    storage = {
      upload: jest.fn().mockImplementation((key: string, data: Buffer) =>
        Promise.resolve({
          provider: BackupStorageProvider.LOCAL,
          location: `/backups/${key}`,
          sizeBytes: data.byteLength,
        }),
      ),
      download: jest.fn(),
    };
    const platform = { get: jest.fn().mockResolvedValue(null) };
    service = new DatabaseBackupService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
      storage as unknown as BackupStorageService,
      platform as unknown as PlatformService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('runs pg_dump and records a SUCCESS backup with size', async () => {
    docker.execCapture.mockResolvedValue({
      stdout: Buffer.from('-- dump\n'),
      stderr: '',
      exitCode: 0,
    });
    const result = await service.createBackup('env-1', 'u1', Role.ADMIN);

    expect(docker.execCapture).toHaveBeenCalledWith('srv-1', 'db-env-1', [
      'sh',
      '-c',
      expect.stringContaining('pg_dump'),
    ]);
    expect(storage.upload).toHaveBeenCalled();
    expect(result.status).toBe(BackupStatus.SUCCESS);
    // Dump is gzipped before upload, so size is the compressed length (>0)
    // and a SHA-256 checksum is recorded for integrity.
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records FAILED when the dump exits non-zero', async () => {
    docker.execCapture.mockResolvedValue({
      stdout: Buffer.alloc(0),
      stderr: 'auth failed',
      exitCode: 1,
    });
    const result = await service.createBackup('env-1', 'u1', Role.ADMIN);
    expect(result.status).toBe(BackupStatus.FAILED);
    expect(result.error).toContain('auth failed');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects engines without a logical dump (REDIS)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'env-1',
      service: { databaseType: ManagedServiceType.REDIS, projectId: 'p1' },
    });
    await expect(
      service.createBackup('env-1', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no running container exists', async () => {
    prisma.container.findFirst.mockResolvedValue(null);
    await expect(
      service.createBackup('env-1', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies a non-member developer', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.createBackup('env-1', 'u2', Role.DEVELOPER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only backs up the requested container status (RUNNING)', async () => {
    docker.execCapture.mockResolvedValue({
      stdout: Buffer.from('x'),
      stderr: '',
      exitCode: 0,
    });
    await service.createBackup('env-1', 'u1', Role.ADMIN);
    expect(prisma.container.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serviceEnvId: 'env-1', status: ContainerStatus.RUNNING },
      }),
    );
  });

  describe('restoreBackup', () => {
    const dump = Buffer.from('-- restore me\n');
    const gzipped = gzipSync(dump);
    const checksum = createHash('sha256').update(gzipped).digest('hex');

    const successBackup = (over: Record<string, unknown> = {}) => ({
      id: 'bk-1',
      serviceEnvironmentId: 'env-1',
      status: BackupStatus.SUCCESS,
      storageProvider: BackupStorageProvider.LOCAL,
      storagePath: '/backups/env-1/bk-1.sql.gz',
      checksum,
      serviceEnvironment: {
        service: { databaseType: ManagedServiceType.POSTGRES },
      },
      ...over,
    });

    it('downloads, verifies checksum and pipes the dump to psql', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(successBackup());
      storage.download.mockResolvedValue(gzipped);
      docker.execWithInput.mockResolvedValue({
        stdout: Buffer.alloc(0),
        stderr: '',
        exitCode: 0,
      });

      const result = await service.restoreBackup('bk-1', 'u1', Role.ADMIN);

      expect(result).toEqual({ ok: true, warnings: null });
      expect(docker.execWithInput).toHaveBeenCalledWith(
        'srv-1',
        'db-env-1',
        ['sh', '-c', expect.stringContaining('psql')],
        dump,
      );
    });

    it('rejects a backup that did not succeed', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(
        successBackup({ status: BackupStatus.FAILED }),
      );
      await expect(
        service.restoreBackup('bk-1', 'u1', Role.ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(docker.execWithInput).not.toHaveBeenCalled();
    });

    it('aborts on checksum mismatch (corruption) without touching the DB', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(successBackup());
      storage.download.mockResolvedValue(gzipSync(randomBytes(16)));
      await expect(
        service.restoreBackup('bk-1', 'u1', Role.ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(docker.execWithInput).not.toHaveBeenCalled();
    });

    it('throws when the restore tool exits non-zero', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(successBackup());
      storage.download.mockResolvedValue(gzipped);
      docker.execWithInput.mockResolvedValue({
        stdout: Buffer.alloc(0),
        stderr: 'syntax error',
        exitCode: 1,
      });
      await expect(
        service.restoreBackup('bk-1', 'u1', Role.ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s on an unknown backup', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(null);
      await expect(
        service.restoreBackup('nope', 'u1', Role.ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('denies a non-member developer', async () => {
      prisma.databaseBackup.findUnique.mockResolvedValue(successBackup());
      prisma.projectMember.findUnique.mockResolvedValue(null);
      await expect(
        service.restoreBackup('bk-1', 'u2', Role.DEVELOPER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
