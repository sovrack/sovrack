// Aligne sur l'enum backend (modele Railway) : la nature du service en 3 axes.
// L'origine de l'artefact reste portee par SourceType (GIT/DOCKER_IMAGE/NONE).
export type ServiceType = 'APPLICATION' | 'DATABASE' | 'MANAGED';

export type SourceType = 'GIT' | 'DOCKER_IMAGE' | 'NONE';

export type BuildPack = 'DOCKERFILE' | 'DOCKER_COMPOSE' | 'NIXPACKS' | 'BUILDPACK' | 'STATIC' | 'NONE';

/** Source connection sent alongside service creation (Git repo + token). */
export type SourceConnectionPayload = {
  provider: 'GITLAB' | 'GITHUB';
  repoPath: string;
  token: string;
  branch?: string;
};

/** One repo returned by the org/group discovery endpoint. */
export type DiscoveredRepo = {
  repoPath: string;
  name: string;
  defaultBranch: string;
};

export type ManagedServiceType = 'POSTGRES' | 'MYSQL' | 'REDIS' | 'MONGODB' | 'RABBITMQ';

export type Service = {
  id: string;
  projectId: string;
  environmentId?: string | null;
  type: ServiceType;
  sourceType: SourceType | null;
  name: string;
  description: string | null;
  // Le backend (endpoint catalog) renvoie `repoPath` (owner/repo ou group/project).
  // `repoUrl` est conservé pour compat (certains contrats l'exposent encore).
  repoPath: string | null;
  repoUrl: string | null;
  branch: string | null;
  providerId: string | null;
  rootDir: string | null;
  buildPack: BuildPack | null;
  buildMode: string | null;
  buildType: string | null;
  dockerfile: string | null;
  port: number | null;
  startCommand: string | null;
  healthcheckPath: string | null;
  replicas: number | null;
  databaseType: ManagedServiceType | null;
  databaseVersion: string | null;
  env: Record<string, string> | null;
  envLinks?: { id: string; environmentId: string }[];
  createdAt: string;
  updatedAt: string;
};

export type CreateServicePayload = {
  name: string;
  type?: ServiceType;
  description?: string;
  sourceType?: SourceType;
  repoPath?: string;
  repoUrl?: string;
  branch?: string;
  source?: SourceConnectionPayload;
  providerId?: string;
  rootDir?: string;
  buildPack?: BuildPack;
  buildMode?: string;
  buildType?: string;
  dockerfile?: string;
  port?: number;
  startCommand?: string;
  buildArgs?: Record<string, string>;
  nixpacksConfig?: Record<string, unknown>;
  staticConfig?: Record<string, unknown>;
  dockerComposeContent?: string;
  composeServiceName?: string;
  databaseType?: ManagedServiceType;
  databaseVersion?: string;
  databaseCredentials?: Record<string, string>;
  env?: string;
  healthcheckPath?: string;
  replicas?: number;
};

export type UpdateServicePayload = Partial<CreateServicePayload>;
