import {
  buildAppSpecSnapshot,
  buildDbSpecSnapshot,
} from './spec-snapshot.util';

const baseService = {
  repoPath: '/org/repo',
  dockerfile: 'Dockerfile',
  rootDir: '/',
  port: 3000,
  startCommand: 'node dist/main',
  healthcheckPath: '/health',
  replicas: 1,
  cpuLimit: null,
  memLimitMb: null,
  buildArgs: null,
};

const baseServiceEnv = {
  port: null,
  startCommand: null,
  healthcheckPath: null,
  replicas: null,
};

describe('buildAppSpecSnapshot', () => {
  it('captures service fields correctly', () => {
    const snap = buildAppSpecSnapshot({
      service: baseService,
      serviceEnv: baseServiceEnv,
      branch: 'main',
      buildSource: 'DOCKERFILE_LOCAL',
      isLocalBuild: true,
      buildPack: 'DOCKERFILE',
      strategy: 'STANDARD',
      nixpacksConfig: null,
      staticConfig: null,
    });

    expect(snap.repoPath).toBe('/org/repo');
    expect(snap.branch).toBe('main');
    expect(snap.buildSource).toBe('DOCKERFILE_LOCAL');
    expect(snap.isLocalBuild).toBe(true);
    expect(snap.port).toBe(3000);
    expect(snap.replicas).toBe(1);
    expect(snap.strategy).toBe('STANDARD');
    expect(snap.capturedAt).toBeTruthy();
    expect(new Date(snap.capturedAt).getFullYear()).toBeGreaterThanOrEqual(
      2024,
    );
  });

  it('serviceEnv overrides service port/startCommand/healthcheckPath/replicas', () => {
    const snap = buildAppSpecSnapshot({
      service: baseService,
      serviceEnv: {
        port: 8080,
        startCommand: 'custom',
        healthcheckPath: '/ping',
        replicas: 3,
      },
      branch: 'main',
      buildSource: 'NIXPACKS_LOCAL',
      isLocalBuild: true,
      buildPack: 'NIXPACKS',
      strategy: 'STANDARD',
      nixpacksConfig: null,
      staticConfig: null,
    });

    expect(snap.port).toBe(8080);
    expect(snap.startCommand).toBe('custom');
    expect(snap.healthcheckPath).toBe('/ping');
    expect(snap.replicas).toBe(3);
  });

  it('falls back to service when serviceEnv values are null', () => {
    const snap = buildAppSpecSnapshot({
      service: { ...baseService, replicas: 2 },
      serviceEnv: baseServiceEnv,
      branch: 'dev',
      buildSource: 'STATIC',
      isLocalBuild: true,
      buildPack: 'STATIC',
      strategy: 'BLUE_GREEN',
      nixpacksConfig: { providers: ['node'] },
      staticConfig: { outputDir: 'dist' },
    });

    expect(snap.replicas).toBe(2);
    expect(snap.strategy).toBe('BLUE_GREEN');
    expect(snap.nixpacksConfig).toEqual({ providers: ['node'] });
    expect(snap.staticConfig).toEqual({ outputDir: 'dist' });
  });
});

describe('buildDbSpecSnapshot', () => {
  it('returns fixed fields for a database service', () => {
    const snap = buildDbSpecSnapshot({
      databaseType: 'POSTGRES',
      databaseVersion: '15',
      databaseImage: 'postgres:15',
    });

    expect(snap.buildSource).toBe('EXTERNAL_IMAGE');
    expect(snap.isLocalBuild).toBe(false);
    expect(snap.strategy).toBe('STANDARD');
    expect(snap.databaseType).toBe('POSTGRES');
    expect(snap.databaseVersion).toBe('15');
    expect(snap.databaseImage).toBe('postgres:15');
    expect(snap.capturedAt).toBeTruthy();
  });

  it('handles null databaseType and databaseVersion', () => {
    const snap = buildDbSpecSnapshot({
      databaseType: null,
      databaseVersion: null,
      databaseImage: 'custom:latest',
    });
    expect(snap.databaseType).toBeNull();
    expect(snap.databaseVersion).toBeNull();
  });
});
