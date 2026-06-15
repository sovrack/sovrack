import { promises as fs } from 'fs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BackupStatus, ContainerStatus, ManagedServiceType, Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { DockerApiService } from '../../core/container-runtime/docker-api.service';
import { DatabaseBackupService } from './database-backup.service';

describe('DatabaseBackupService', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    container: { findFirst: jest.Mock };
    databaseBackup: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    projectMember: { findUnique: jest.Mock };
  };
  let docker: { execCapture: jest.Mock };
  let service: DatabaseBackupService;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      serviceEnvironment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'env-1',
          service: { databaseType: ManagedServiceType.POSTGRES, projectId: 'p1' },
        }),
      },
      container: {
        findFirst: jest.fn().mockResolvedValue({ serverId: 'srv-1', name: 'db-env-1' }),
      },
      databaseBackup: {
        create: jest.fn().mockResolvedValue({ id: 'bk-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'bk-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectMember: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
    };
    docker = { execCapture: jest.fn() };
    service = new DatabaseBackupService(
      prisma as unknown as PrismaService,
      docker as unknown as DockerApiService,
    );
    writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as unknown as string);
  });

  afterEach(() => jest.restoreAllMocks());

  it('runs pg_dump and records a SUCCESS backup with size', async () => {
    docker.execCapture.mockResolvedValue({ stdout: Buffer.from('-- dump\n'), stderr: '', exitCode: 0 });
    const result = await service.createBackup('env-1', 'u1', Role.ADMIN);

    expect(docker.execCapture).toHaveBeenCalledWith('srv-1', 'db-env-1', [
      'sh',
      '-c',
      expect.stringContaining('pg_dump'),
    ]);
    expect(writeSpy).toHaveBeenCalled();
    expect(result.status).toBe(BackupStatus.SUCCESS);
    expect(result.sizeBytes).toBe(Buffer.from('-- dump\n').byteLength);
  });

  it('records FAILED when the dump exits non-zero', async () => {
    docker.execCapture.mockResolvedValue({ stdout: Buffer.alloc(0), stderr: 'auth failed', exitCode: 1 });
    const result = await service.createBackup('env-1', 'u1', Role.ADMIN);
    expect(result.status).toBe(BackupStatus.FAILED);
    expect(result.error).toContain('auth failed');
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('rejects engines without a logical dump (REDIS)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      id: 'env-1',
      service: { databaseType: ManagedServiceType.REDIS, projectId: 'p1' },
    });
    await expect(service.createBackup('env-1', 'u1', Role.ADMIN)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no running container exists', async () => {
    prisma.container.findFirst.mockResolvedValue(null);
    await expect(service.createBackup('env-1', 'u1', Role.ADMIN)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('denies a non-member developer', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(service.createBackup('env-1', 'u2', Role.DEVELOPER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('only backs up the requested container status (RUNNING)', async () => {
    docker.execCapture.mockResolvedValue({ stdout: Buffer.from('x'), stderr: '', exitCode: 0 });
    await service.createBackup('env-1', 'u1', Role.ADMIN);
    expect(prisma.container.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceEnvId: 'env-1', status: ContainerStatus.RUNNING } }),
    );
  });
});
