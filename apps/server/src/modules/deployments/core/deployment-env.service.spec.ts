import { ManagedServiceType, ServiceType } from '@prisma/client';
import { DeploymentEnvService } from './deployment-env.service';

function makeSvc(opts: {
  dbs?: Array<{ name: string; databaseType: string; databaseCredentials: unknown }>;
  volumeError?: boolean;
} = {}) {
  const prisma = {
    service: {
      findMany: jest.fn().mockResolvedValue(opts.dbs ?? []),
    },
  } as never;

  const docker = {
    createVolume: opts.volumeError
      ? jest.fn().mockRejectedValue(new Error('volume error'))
      : jest.fn().mockResolvedValue(undefined),
  } as never;

  const crypto = {
    decryptSafe: jest.fn().mockImplementation((v: string | null) => v ?? null),
  } as never;

  const logEmitter = {
    emit: jest.fn(),
  } as never;

  return {
    svc: new DeploymentEnvService(prisma, docker, crypto, logEmitter),
    prisma, docker, crypto, logEmitter,
  };
}

function makeDeployment(overrides = {}) {
  return {
    id: 'dep1',
    project: { id: 'proj1' },
    service: { id: 'svc1', type: ServiceType.APP, env: 'PORT=3000', secretsEnv: null },
    serviceEnv: {
      env: 'NODE_ENV=production',
      secretsEnv: null,
      environment: { env: 'REGION=eu', secretsEnv: null },
    },
    environment: null,
    ...overrides,
  };
}

describe('DeploymentEnvService', () => {
  describe('resolveAutoWiredDbEnv', () => {
    it('returns null when service type is DATABASE', async () => {
      const { svc } = makeSvc();
      const deployment = {
        project: { id: 'proj1' },
        service: { id: 'svc1', type: ServiceType.DATABASE },
        serviceEnv: { environment: { id: 'env1' } },
        environment: null,
      };
      const result = await svc.resolveAutoWiredDbEnv(deployment);
      expect(result).toBeNull();
    });

    it('returns null when no envId can be resolved', async () => {
      const { svc } = makeSvc();
      const deployment = {
        project: { id: 'proj1' },
        service: { id: 'svc1', type: ServiceType.APP },
        serviceEnv: null,
        environment: null,
      };
      const result = await svc.resolveAutoWiredDbEnv(deployment);
      expect(result).toBeNull();
    });

    it('returns null when no database services are found', async () => {
      const { svc } = makeSvc({ dbs: [] });
      const deployment = {
        project: { id: 'proj1' },
        service: { id: 'svc1', type: ServiceType.APP },
        serviceEnv: { environment: { id: 'env1' } },
        environment: null,
      };
      const result = await svc.resolveAutoWiredDbEnv(deployment);
      expect(result).toBeNull();
    });

    it('resolves DATABASE_URL from linked managed database', async () => {
      const { svc } = makeSvc({
        dbs: [{
          name: 'postgres',
          databaseType: ManagedServiceType.POSTGRES,
          databaseCredentials: JSON.stringify({ user: 'admin', password: 'secret', dbName: 'mydb' }),
        }],
      });
      const deployment = {
        project: { id: 'proj1' },
        service: { id: 'svc1', type: ServiceType.APP },
        serviceEnv: { environment: { id: 'env1' } },
        environment: null,
      };
      const result = await svc.resolveAutoWiredDbEnv(deployment);
      expect(result).toContain('DATABASE_URL');
    });

    it('uses environment.id when serviceEnv has no environment', async () => {
      const { svc, prisma } = makeSvc({ dbs: [] });
      const deployment = {
        project: { id: 'proj1' },
        service: { id: 'svc1', type: ServiceType.APP },
        serviceEnv: null,
        environment: { id: 'env2' },
      };
      await svc.resolveAutoWiredDbEnv(deployment);
      expect(prisma.service.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            envLinks: { some: { environmentId: 'env2', archivedAt: null } },
          }),
        }),
      );
    });
  });

  describe('resolveDeploymentEnv', () => {
    it('returns envVars array from resolved levels', () => {
      const { svc } = makeSvc();
      const deployment = makeDeployment();
      const { envVars } = svc.resolveDeploymentEnv(deployment, null);
      expect(Array.isArray(envVars)).toBe(true);
    });

    it('prepends auto-db level when autoDbEnv is provided', () => {
      const { svc } = makeSvc();
      // autoDbEnv must be JSON format — the resolver expects JSON objects.
      const deployment = makeDeployment({ service: null, serviceEnv: null, environment: null });
      const { envVars } = svc.resolveDeploymentEnv(
        deployment,
        '{"DATABASE_URL": "postgresql://user:pass@db:5432/app"}',
      );
      expect(envVars.some((v) => v.startsWith('DATABASE_URL='))).toBe(true);
    });

    it('user-defined vars override auto-db vars', () => {
      const { svc } = makeSvc();
      // Service env is JSON; auto-db JSON is lower priority.
      const deployment = makeDeployment({
        service: { id: 'svc1', type: ServiceType.APP, env: '{"DATABASE_URL": "postgres://user-defined"}', secretsEnv: null },
        serviceEnv: null,
        environment: null,
      });
      const { envVars } = svc.resolveDeploymentEnv(
        deployment,
        '{"DATABASE_URL": "postgres://auto"}',
      );
      const dbEntry = envVars.find((v) => v.startsWith('DATABASE_URL='));
      expect(dbEntry).toBe('DATABASE_URL=postgres://user-defined');
    });

    it('emits warning log for malformed JSON env', () => {
      const { svc, logEmitter } = makeSvc();
      const deployment = makeDeployment({
        service: { id: 'svc1', type: ServiceType.APP, env: 'NOT_JSON_AT_ALL', secretsEnv: null },
        serviceEnv: null,
        environment: null,
      });
      svc.resolveDeploymentEnv(deployment, null);
      expect(logEmitter.emit).toHaveBeenCalledWith(
        'dep1',
        expect.stringContaining('[ENV]'),
        'error',
      );
    });

    it('returns empty commandLogs when no warnings', () => {
      const { svc } = makeSvc();
      const deployment = makeDeployment({
        service: { id: 'svc1', type: ServiceType.APP, env: '{"PORT": "3000"}', secretsEnv: null },
        serviceEnv: null,
        environment: null,
      });
      const { commandLogs } = svc.resolveDeploymentEnv(deployment, null);
      expect(commandLogs).toBe('');
    });
  });

  describe('setupDbVolume', () => {
    it('returns undefined fields for non-DATABASE service', async () => {
      const { svc } = makeSvc();
      const deployment = {
        id: 'dep1',
        service: { type: ServiceType.APP, databaseType: null, databaseCredentials: null },
      };
      const result = await svc.setupDbVolume(deployment, 'srv1', [], 5432);
      expect(result.dbVolumeName).toBeUndefined();
      expect(result.dbVolumePath).toBeUndefined();
      expect(result.commandLogs).toBe('');
    });

    it('returns undefined fields when databaseType is null', async () => {
      const { svc } = makeSvc();
      const deployment = {
        id: 'dep1',
        service: { type: ServiceType.DATABASE, databaseType: null, databaseCredentials: null },
      };
      const result = await svc.setupDbVolume(deployment, 'srv1', [], 5432);
      expect(result.dbVolumeName).toBeUndefined();
    });

    it('creates data volume for DATABASE service and returns volume name', async () => {
      const { svc, docker } = makeSvc();
      const deployment = {
        id: 'dep1',
        service: {
          type: ServiceType.DATABASE,
          databaseType: ManagedServiceType.POSTGRES,
          databaseCredentials: JSON.stringify({ user: 'pg', password: 'pass', dbName: 'db1' }),
        },
      };
      const result = await svc.setupDbVolume(deployment, 'srv1', [], 5432);
      expect(docker.createVolume).toHaveBeenCalledWith('srv1', 'dep1-data');
      expect(result.dbVolumeName).toBe('dep1-data');
      expect(result.commandLogs).toContain('dep1-data');
    });

    it('injects POSTGRES_* env vars for PostgreSQL', async () => {
      const { svc } = makeSvc();
      const envVars: string[] = [];
      const deployment = {
        id: 'dep1',
        service: {
          type: ServiceType.DATABASE,
          databaseType: ManagedServiceType.POSTGRES,
          databaseCredentials: JSON.stringify({ user: 'pg', password: 'pass', dbName: 'mydb' }),
        },
      };
      await svc.setupDbVolume(deployment, 'srv1', envVars, 5432);
      expect(envVars.some((v) => v.startsWith('POSTGRES_'))).toBe(true);
    });

    it('does not add duplicate env vars', async () => {
      const { svc } = makeSvc();
      const envVars = ['POSTGRES_USER=existing'];
      const deployment = {
        id: 'dep1',
        service: {
          type: ServiceType.DATABASE,
          databaseType: ManagedServiceType.POSTGRES,
          databaseCredentials: JSON.stringify({ user: 'existing', password: 'pass', dbName: 'db' }),
        },
      };
      await svc.setupDbVolume(deployment, 'srv1', envVars, 5432);
      const count = envVars.filter((v) => v === 'POSTGRES_USER=existing').length;
      expect(count).toBe(1);
    });
  });
});
