import type { BuildSource } from '../../build/strategies/build-strategy.interface';

export type AppSpecSnapshot = {
  capturedAt: string;
  repoPath: string | null;
  branch: string;
  buildSource: BuildSource;
  isLocalBuild: boolean;
  buildPack: string | null;
  dockerfile: string | null;
  rootDir: string | null;
  port: number | null;
  startCommand: string | null;
  healthcheckPath: string | null;
  replicas: number;
  cpuLimit: number | null;
  memLimitMb: number | null;
  buildArgs: unknown;
  strategy: 'STANDARD' | 'BLUE_GREEN';
  nixpacksConfig: unknown;
  staticConfig: unknown;
};

export type DbSpecSnapshot = {
  capturedAt: string;
  buildSource: 'EXTERNAL_IMAGE';
  isLocalBuild: false;
  strategy: 'STANDARD';
  databaseType: string | null;
  databaseVersion: string | null;
  databaseImage: string;
};

export function buildAppSpecSnapshot(params: {
  service: {
    repoPath: string | null;
    dockerfile: string | null;
    rootDir: string | null;
    port: number | null;
    startCommand: string | null;
    healthcheckPath: string | null;
    replicas: number;
    cpuLimit: number | null;
    memLimitMb: number | null;
    buildArgs: unknown;
  };
  serviceEnv: {
    port: number | null;
    startCommand: string | null;
    healthcheckPath: string | null;
    replicas: number | null;
  };
  branch: string;
  buildSource: BuildSource;
  isLocalBuild: boolean;
  buildPack: string | null;
  strategy: 'STANDARD' | 'BLUE_GREEN';
  nixpacksConfig: unknown;
  staticConfig: unknown;
}): AppSpecSnapshot {
  const { service, serviceEnv } = params;
  return {
    capturedAt: new Date().toISOString(),
    repoPath: service.repoPath ?? null,
    branch: params.branch,
    buildSource: params.buildSource,
    isLocalBuild: params.isLocalBuild,
    buildPack: params.buildPack,
    dockerfile: service.dockerfile ?? null,
    rootDir: service.rootDir ?? null,
    port: serviceEnv.port ?? service.port ?? null,
    startCommand: serviceEnv.startCommand ?? service.startCommand ?? null,
    healthcheckPath:
      serviceEnv.healthcheckPath ?? service.healthcheckPath ?? null,
    replicas: serviceEnv.replicas ?? service.replicas ?? 1,
    cpuLimit: service.cpuLimit ?? null,
    memLimitMb: service.memLimitMb ?? null,
    buildArgs: service.buildArgs ?? null,
    strategy: params.strategy,
    nixpacksConfig: params.nixpacksConfig ?? null,
    staticConfig: params.staticConfig ?? null,
  };
}

export function buildDbSpecSnapshot(params: {
  databaseType: string | null;
  databaseVersion: string | null;
  databaseImage: string;
}): DbSpecSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    buildSource: 'EXTERNAL_IMAGE',
    isLocalBuild: false,
    strategy: 'STANDARD',
    databaseType: params.databaseType,
    databaseVersion: params.databaseVersion,
    databaseImage: params.databaseImage,
  };
}
