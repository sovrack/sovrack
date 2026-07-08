import type { components } from "@/generated/api-contract";

type ApiSchema = components["schemas"];

// Aligne sur l'enum backend (modele Railway) : la nature du service en 3 axes.
// L'origine de l'artefact reste portee par SourceType (GIT/DOCKER_IMAGE/NONE).
export type ServiceType = "APPLICATION" | "DATABASE" | "MANAGED";

export type SourceType = "GIT" | "DOCKER_IMAGE" | "NONE";

export type BuildPack =
  | "DOCKERFILE"
  | "DOCKER_COMPOSE"
  | "NIXPACKS"
  | "BUILDPACK"
  | "STATIC"
  | "NONE";

/** Source connection sent alongside service creation (Git repo + token). */
export type SourceConnectionPayload = {
  provider: "GITLAB" | "GITHUB";
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

export type ManagedServiceType =
  "POSTGRES" | "MYSQL" | "REDIS" | "MONGODB" | "RABBITMQ";

/** One-click service template (multi-component bundle) exposed by the backend catalogue. */
export type ServiceTemplate = {
  id: string;
  name: string;
  description: string;
  services: {
    nameSuffix: string;
    type: ServiceType;
    databaseType?: ManagedServiceType | null;
  }[];
};

/**
 * DATABASE service credentials, loaded on demand from the DEDICATED, gated
 * endpoint (GET /projects/:id/services/:sid/credentials) — never from the
 * general service listing, which omits these fields (see backend Task 1 fix).
 */
export type ServiceCredentials = {
  serviceId: string;
  databaseType: ManagedServiceType;
  internal: {
    user: string;
    dbName: string;
    password: string;
    /** Distinct root password — only for engines that init one (MySQL). */
    rootPassword: string | null;
    /** Stable internal Docker network alias (other services connect here). */
    host: string;
    /** Engine port inside the container (5432, 3306, …). */
    port: number;
    /** Connection env var name (DATABASE_URL / REDIS_URL / AMQP_URL). */
    connectionUrlEnvKey: string;
    connectionUrl: string;
  };
  external: {
    enabled: boolean;
    port: number | null;
  };
};

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
  // Build-time variables (baked into the image via --build-arg, e.g.
  // NEXT_PUBLIC_*). Returned by GET /services (not omitted). Public by design.
  // Optional: matches the generated contract's optionality + older mocks.
  buildArgs?: Record<string, string> | null;
  buildPack: BuildPack | null;
  buildMode: string | null;
  deployTrigger: string | null;
  registryImage: string | null;
  buildType: string | null;
  dockerfile: string | null;
  port: number | null;
  startCommand: string | null;
  healthcheckPath: string | null;
  replicas: number | null;
  databaseType: ManagedServiceType | null;
  databaseVersion: string | null;
  env: Record<string, string> | null;
  envLinks?: {
    id: string;
    environmentId: string;
    serverId: string | null;
    currentDeploymentId: string | null;
  }[];
  createdAt: string;
  updatedAt: string;
};

// Derived from the backend contract (gains the enum precision for type/buildMode/
// deployTrigger/databaseType + the cpuLimit/memLimitMb fields). The few JSON
// fields the contract can only type as `object` are overridden here with the
// precise shapes the create form relies on. `source` keeps the local payload type.
export type CreateServicePayload = Omit<
  ApiSchema["CreateServiceDto"],
  "buildArgs" | "nixpacksConfig" | "staticConfig" | "source" | "externalPort"
> & {
  buildArgs?: Record<string, string>;
  nixpacksConfig?: Record<string, unknown>;
  staticConfig?: Record<string, unknown>;
  source?: SourceConnectionPayload;
  // number = publish on that host port · null = disable external exposure.
  externalPort?: number | null;
};

export type UpdateServicePayload = Partial<CreateServicePayload>;
