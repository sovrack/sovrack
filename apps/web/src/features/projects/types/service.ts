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
  "buildArgs" | "nixpacksConfig" | "staticConfig" | "source"
> & {
  buildArgs?: Record<string, string>;
  nixpacksConfig?: Record<string, unknown>;
  staticConfig?: Record<string, unknown>;
  source?: SourceConnectionPayload;
};

export type UpdateServicePayload = Partial<CreateServicePayload>;
