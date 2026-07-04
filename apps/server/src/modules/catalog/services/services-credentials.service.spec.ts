import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ServicesCredentialsService } from './services-credentials.service';
import type { PrismaService } from '../../../shared/database/prisma.service';
import type { ProjectAccessService } from '../authorization/project-access.service';

describe('ServicesCredentialsService', () => {
  function build() {
    const prisma = {
      service: { findFirst: jest.fn() },
    } as unknown as PrismaService;
    const projectAccess = {
      assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectAccessService;
    const service = new ServicesCredentialsService(prisma, projectAccess);
    return { service, prisma, projectAccess };
  }

  it('enforces project access before returning anything', async () => {
    const { service, prisma, projectAccess } = build();
    (projectAccess.assertCanAccessProject as jest.Mock).mockRejectedValue(
      new Error('forbidden'),
    );
    await expect(
      service.getCredentials('p1', 's1', 'u1', Role.DEVELOPER),
    ).rejects.toThrow('forbidden');
    // Never touched the DB once access was denied.
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
  });

  it('assembles internal Postgres credentials + connection URL on the stable alias', async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id: 's1',
      name: 'My Postgres',
      type: 'DATABASE',
      databaseType: 'POSTGRES',
      databaseCredentials: { user: 'appuser', password: 's3cr3t', dbName: 'core' },
      externalPort: null,
    });

    const res = await service.getCredentials('p1', 's1', 'u1', Role.ADMIN);

    expect(res.internal).toEqual({
      user: 'appuser',
      dbName: 'core',
      password: 's3cr3t',
      rootPassword: null,
      host: 'my-postgres',
      port: 5432,
      connectionUrlEnvKey: 'DATABASE_URL',
      connectionUrl: 'postgresql://appuser:s3cr3t@my-postgres:5432/core',
    });
    // Internal-only by default: not exposed externally.
    expect(res.external).toEqual({ enabled: false, port: null });
  });

  it('exposes a distinct rootPassword only for MySQL, and reports the external port when set', async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id: 's2',
      name: 'orders-db',
      type: 'DATABASE',
      databaseType: 'MYSQL',
      databaseCredentials: { user: 'u', password: 'pw', dbName: 'orders' },
      externalPort: 3307,
    });

    const res = await service.getCredentials('p1', 's2', 'u1', Role.ADMIN);

    expect(res.internal.rootPassword).toBe('pw');
    expect(res.internal.port).toBe(3306);
    expect(res.external).toEqual({ enabled: true, port: 3307 });
  });

  it('throws NotFound when the service does not exist', async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.getCredentials('p1', 'missing', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-DATABASE service (credentials only apply to databases)', async () => {
    const { service, prisma } = build();
    (prisma.service.findFirst as jest.Mock).mockResolvedValue({
      id: 's3',
      name: 'api',
      type: 'APPLICATION',
      databaseType: null,
      databaseCredentials: null,
      externalPort: null,
    });
    await expect(
      service.getCredentials('p1', 's3', 'u1', Role.ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
