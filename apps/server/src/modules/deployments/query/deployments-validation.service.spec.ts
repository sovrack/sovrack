import { BadRequestException } from '@nestjs/common';

// Mock the repo-clone preflight's outbound calls (git + temp askpass file).
const execFileMock = jest.fn(
  (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (e: Error | null, r: { stdout: string; stderr: string }) => void,
  ) => cb(null, { stdout: 'refs/heads/main', stderr: '' }),
);
jest.mock('child_process', () => ({ execFile: execFileMock }));
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Role: { ADMIN: 'ADMIN', DEVELOPER: 'DEVELOPER' },
}));
jest.mock('../../../shared/database/prisma.service', () => ({
  PrismaService: class {},
}));

import { PrismaService } from '../../../shared/database/prisma.service';
import { SshExecutorService } from '../../../adapters/ssh/ssh-executor.service';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { DeploymentsValidationService } from './deployments-validation.service';

describe('DeploymentsValidationService.validate', () => {
  let prisma: {
    serviceEnvironment: { findUnique: jest.Mock };
    environment: { findFirst: jest.Mock };
    server: { findUnique: jest.Mock };
    serverRun: { findFirst: jest.Mock };
  };
  let auth: { getActor: jest.Mock; assertCanDeployProject: jest.Mock };
  let providers: { forProject: jest.Mock; forService: jest.Mock };
  let service: DeploymentsValidationService;

  beforeEach(() => {
    execFileMock.mockClear();
    prisma = {
      serviceEnvironment: { findUnique: jest.fn().mockResolvedValue(null) },
      environment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'env-1',
          servers: [{ id: 'srv-1', name: 'srv', host: '10.0.0.1' }],
        }),
      },
      server: {
        findUnique: jest.fn().mockResolvedValue({
          installedTools: [
            { toolKey: 'docker', status: 'INSTALLED' },
            { toolKey: 'nixpacks', status: 'INSTALLED' },
          ],
        }),
      },
      serverRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 'run-1' }),
      },
    };
    auth = {
      getActor: jest.fn().mockResolvedValue({ id: 'u1', role: 'ADMIN' }),
      assertCanDeployProject: jest.fn().mockResolvedValue(undefined),
    };
    providers = {
      forProject: jest.fn().mockResolvedValue({
        resolveGitCredentials: jest.fn().mockResolvedValue({
          repoUrl: 'https://gitlab.example.com/g/r.git',
          token: 't',
        }),
      }),
      forService: jest.fn(),
    };
    service = new DeploymentsValidationService(
      prisma as unknown as PrismaService,
      auth as unknown as DeploymentsAuthorizationService,
      {} as never,
      {} as never,
      {} as unknown as SshExecutorService,
      providers as unknown as SourceProvidersService,
    );
  });

  it('enforces deploy authorization before anything else', async () => {
    auth.assertCanDeployProject.mockRejectedValue(new Error('forbidden'));
    await expect(
      service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1'),
    ).rejects.toThrow('forbidden');
  });

  it('rejects a DATABASE service without databaseType', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: {
        type: 'DATABASE',
        databaseType: null,
        databaseCredentials: null,
      },
    });
    await expect(
      service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1', 'se-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a DATABASE service with incomplete credentials', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: {
        type: 'DATABASE',
        databaseType: 'POSTGRES',
        databaseCredentials: { user: 'u' }, // missing password + dbName
      },
    });
    await expect(
      service.validate('p1', 'env-1', 'EXTERNAL_IMAGE', 'u1', 'se-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid DATABASE service (ready, EXTERNAL_IMAGE)', async () => {
    prisma.serviceEnvironment.findUnique.mockResolvedValue({
      service: {
        type: 'DATABASE',
        databaseType: 'POSTGRES',
        databaseCredentials: { user: 'u', password: 'p', dbName: 'd' },
      },
    });
    const res = await service.validate(
      'p1',
      'env-1',
      'EXTERNAL_IMAGE',
      'u1',
      'se-1',
    );
    expect(res.ready).toBe(true);
    expect(res.buildSource).toBe('EXTERNAL_IMAGE');
  });

  it('throws when the environment is not found', async () => {
    prisma.environment.findFirst.mockResolvedValue(null);
    await expect(
      service.validate('p1', 'env-x', 'EXTERNAL_IMAGE', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns required tools for a registry source without cloning the repo', async () => {
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
    );
    expect(res.ready).toBe(true);
    expect(res.required.map((r) => r.binary)).toContain('docker');
    expect(execFileMock).not.toHaveBeenCalled(); // registry source skips git preflight
  });

  it('runs the git preflight for local sources and passes when reachable', async () => {
    const res = await service.validate('p1', 'env-1', 'DOCKERFILE_LOCAL', 'u1');
    expect(res.ready).toBe(true);
    expect(execFileMock).toHaveBeenCalled(); // local source clones-check the repo
  });

  it('fails a local source when the repo is unreachable', async () => {
    execFileMock.mockImplementationOnce((_f, _a, _o, cb) =>
      cb(null, { stdout: '', stderr: 'fatal: Authentication failed' }),
    );
    await expect(
      service.validate('p1', 'env-1', 'DOCKERFILE_LOCAL', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns ready:false when the server has no successful preparation run', async () => {
    prisma.serverRun.findFirst.mockResolvedValue(null);
    const res = await service.validate(
      'p1',
      'env-1',
      'DOCKERFILE_REGISTRY',
      'u1',
    );
    expect(res.ready).toBe(false);
    expect(res.missing.map((m) => m.binary)).toContain('docker');
  });

  it('returns ready:false when a required tool is not installed', async () => {
    prisma.server.findUnique.mockResolvedValue({ installedTools: [] });
    const res = await service.validate('p1', 'env-1', 'NIXPACKS_LOCAL', 'u1');
    expect(res.ready).toBe(false);
    expect(res.missing.length).toBeGreaterThan(0);
  });
});
