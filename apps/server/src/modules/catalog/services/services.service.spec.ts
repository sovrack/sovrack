import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, ServiceType } from '@prisma/client';
import { ServicesService } from './services.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { CreateServiceDto } from './dto/create-service.dto';

describe('ServicesService — soft-delete name collision', () => {
  const projectId = 'project-1';
  const serviceId = 'service-1';

  function buildService(updateSpy: jest.Mock) {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ id: projectId }),
      },
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: serviceId }),
        findUnique: jest.fn().mockResolvedValue({ name: 'api' }),
        update: updateSpy,
      },
    } as unknown as PrismaService;

    return new ServicesService(
      prisma,
      {} as never,
      {} as never,
      new ProjectAccessService(prisma),
      {} as never, // CryptoService — unused by remove()
    );
  }

  it('archiving a service suffixes its name so the original name is freed', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.remove(projectId, serviceId, 'user-1', Role.ADMIN);

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(data.name).not.toBe('api');
    expect(data.name).toMatch(/^api_archived_\d+$/);
  });

  it('frees the (projectId, name) unique slot so the same name can be recreated', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.remove(projectId, serviceId, 'user-1', Role.ADMIN);

    // After archiving, the stored name no longer equals "api", so a new
    // service named "api" in the same project would not hit @@unique.
    const archivedName = update.mock.calls[0][0].data.name as string;
    expect(archivedName.startsWith('api_archived_')).toBe(true);
    expect(archivedName).not.toBe('api');
  });
});

describe('ServicesService — CRUD', () => {
  const projectId = 'project-1';
  const userId = 'user-1';

  function harness() {
    const prisma = {
      service: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
      serviceEnvironment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // $transaction est mocké pour exécuter le callback avec ce même mock en
      // guise de `tx` — suffisant en test unitaire, l'atomicité réelle (tout
      // ou rien) est garantie par Prisma en production, pas testable ici.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const serviceEnvs = {
      linkServiceToAllEnvs: jest.fn().mockResolvedValue(undefined),
    };
    const sourceProviders = {
      discoverGroup: jest.fn().mockResolvedValue({ repos: [] }),
      connectRepo: jest.fn().mockResolvedValue(undefined),
    };
    const projectAccess = {
      assertCanAccessProject: jest.fn().mockResolvedValue(undefined),
      assertCanManageProject: jest.fn().mockResolvedValue(undefined),
    };
    const crypto = {
      encryptOptional: jest.fn((v?: string | null) => (v ? `enc:${v}` : null)),
      encrypt: jest.fn((v: string) => `enc:${v}`),
      decryptSafe: jest.fn((v?: string | null) => v ?? null),
    };
    const service = new ServicesService(
      prisma as unknown as PrismaService,
      serviceEnvs as unknown as ServiceEnvironmentsService,
      sourceProviders as unknown as SourceProvidersService,
      projectAccess as unknown as ProjectAccessService,
      crypto as unknown as CryptoService,
    );
    return {
      service,
      prisma,
      serviceEnvs,
      sourceProviders,
      projectAccess,
      crypto,
    };
  }

  it('findAll checks access then returns the project services', async () => {
    const { service, prisma, projectAccess } = harness();
    prisma.service.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

    const result = await service.findAll(projectId, userId, Role.ADMIN);

    expect(projectAccess.assertCanAccessProject).toHaveBeenCalledWith(
      projectId,
      userId,
      Role.ADMIN,
    );
    expect(result).toHaveLength(2);
  });

  it('findOne returns the service when found', async () => {
    const { service, prisma } = harness();
    prisma.service.findFirst.mockResolvedValue({ id: 's1', name: 'api' });

    const result = await service.findOne(projectId, 's1', userId, Role.ADMIN);

    expect(result.id).toBe('s1');
  });

  it('findOne throws NotFoundException when absent', async () => {
    const { service, prisma } = harness();
    prisma.service.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(projectId, 'missing', userId, Role.ADMIN),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('discoverGroup delegates to the source providers service', async () => {
    const { service, sourceProviders } = harness();

    await service.discoverGroup(
      projectId,
      {
        groupPath: 'grp',
        provider: 'GITLAB',
        token: 't',
        providerId: 'p1',
      } as never,
      userId,
      Role.ADMIN,
    );

    expect(sourceProviders.discoverGroup).toHaveBeenCalledWith(
      projectId,
      'grp',
      'GITLAB',
      't',
      'p1',
    );
  });

  it('create links the service to all envs and returns the loaded service', async () => {
    const { service, prisma, serviceEnvs } = harness();
    prisma.service.create.mockResolvedValue({ id: 's1' });
    prisma.service.findFirst.mockResolvedValue({ id: 's1', name: 'api' });

    const result = await service.create(
      projectId,
      { name: 'api', type: ServiceType.APPLICATION } as CreateServiceDto,
      userId,
      Role.ADMIN,
    );

    // 5e argument = tx Prisma optionnel (undefined ici : create() n'est pas
    // appelé depuis une transaction explicite dans ce test) — propagé tel
    // quel par create() pour que linkServiceToAllEnvs participe à la même
    // transaction quand create() est appelé depuis createFromTemplate().
    expect(serviceEnvs.linkServiceToAllEnvs).toHaveBeenCalledWith(
      projectId,
      's1',
      userId,
      Role.ADMIN,
      undefined,
    );
    expect(result.id).toBe('s1');
  });

  it('create encrypts service-level secretsEnv before persisting', async () => {
    const { service, prisma, crypto } = harness();
    prisma.service.create.mockResolvedValue({ id: 's1' });
    prisma.service.findFirst.mockResolvedValue({ id: 's1', name: 'api' });

    await service.create(
      projectId,
      {
        name: 'api',
        type: ServiceType.APPLICATION,
        secretsEnv: '{"API_KEY":"x"}',
      } as CreateServiceDto,
      userId,
      Role.ADMIN,
    );

    expect(crypto.encryptOptional).toHaveBeenCalledWith('{"API_KEY":"x"}');
    expect(prisma.service.create.mock.calls[0][0].data.secretsEnv).toBe(
      'enc:{"API_KEY":"x"}',
    );
  });

  it('create maps a Prisma P2002 unique violation to ConflictException', async () => {
    const { service, prisma } = harness();
    prisma.service.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '6.0.0',
      }),
    );

    await expect(
      service.create(
        projectId,
        { name: 'api', type: ServiceType.APPLICATION } as CreateServiceDto,
        userId,
        Role.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create generates a strong DB password when none is provided', async () => {
    const { service, prisma } = harness();
    prisma.service.create.mockResolvedValue({ id: 'db1' });
    prisma.service.findFirst.mockResolvedValue({ id: 'db1', name: 'db' });

    await service.create(
      projectId,
      { name: 'db', type: ServiceType.DATABASE } as CreateServiceDto,
      userId,
      Role.ADMIN,
    );

    const creds = prisma.service.create.mock.calls[0][0].data
      .databaseCredentials as { password: string };
    expect(creds.password).toBeTruthy();
    expect(creds.password.toLowerCase()).not.toBe('changeme');
    expect(creds.password.length).toBeGreaterThan(10);
  });

  it('update applies the patch and bumps the generation of every ServiceEnvironment', async () => {
    const { service, prisma } = harness();
    prisma.service.findFirst.mockResolvedValue({ id: 's1' });
    prisma.service.update.mockResolvedValue({ id: 's1', name: 'renamed' });

    await service.update(
      projectId,
      's1',
      { name: 'renamed' } as never,
      userId,
      Role.ADMIN,
    );

    expect(prisma.service.update.mock.calls[0][0].data.name).toBe('renamed');
    expect(prisma.serviceEnvironment.updateMany).toHaveBeenCalledWith({
      where: { serviceId: 's1' },
      data: { generation: { increment: 1 } },
    });
  });

  it('propagates the access guard rejection without touching the DB', async () => {
    const { service, prisma, projectAccess } = harness();
    projectAccess.assertCanManageProject.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      service.create(
        projectId,
        { name: 'api', type: ServiceType.APPLICATION } as CreateServiceDto,
        userId,
        Role.DEVELOPER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.service.create).not.toHaveBeenCalled();
  });
});
