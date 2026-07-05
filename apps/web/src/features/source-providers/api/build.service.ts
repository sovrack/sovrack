import api from "@/shared/lib/api";

const BUILD_PREPARE_TIMEOUT_MS = 60_000;

export type BuildDetectResult = {
  type: string;
  confidence: "high" | "medium" | "low";
  language: string;
  framework: string;
  packageManager: string;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  recommendedStrategy:
    | "docker"
    | "docker-multi-stage"
    | "nixpacks"
    | "static-build"
    | "service-container";
  recommendedBuildType: string;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
};

export type BuildPrepareResult = {
  type: string;
  confidence: string;
  language: string;
  framework: string;
  packageManager: string;
  recommendedStrategy: string;
  recommendedBuildType: string;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  dockerfileContent: string;
  dockerignoreContent: string;
  // CI file content + its provider-correct path (.gitlab-ci.yml for GitLab,
  // .github/workflows/deploy.yml for GitHub). The backend returns these as
  // ciConfigContent/ciConfigFilePath — do NOT rename to gitlabCiContent.
  ciConfigContent: string;
  ciConfigFilePath: string;
  serviceResult: BuildAllResult;
};

export type BuildConfig = {
  defaultBuildSource?: string;
  projectType?: string;
  buildPort?: number;
  buildStartCmd?: string;
  autoDeploy?: boolean;
  autoDeployBranch?: string;
  dockerfileContent?: string;
  gitlabCiContent?: string;
};

export type BuildTemplates = {
  types: string[];
};

export type BuildServiceStatus = {
  id: string;
  name: string;
  type: string;
  repositoryPath: string | null;
  defaultBranch: string;
  gitlabProjectId: string | null;
  ready: boolean;
  missingRequirements: string[];
  lastPipeline: {
    id: number;
    status: string;
    ref: string;
    webUrl: string;
  } | null;
};

export type BuildAllResult = {
  serviceId: string;
  serviceName: string;
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  message: string;
  dockerfileStatus: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED";
  dockerignoreStatus: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED";
  ciStatus: "CREATED" | "UPDATED" | "SKIPPED" | "FAILED";
  webhookStatus: "CONFIGURED" | "PENDING_CONFIGURATION" | "FAILED" | "DISABLED";
  webhookMessage: string | null;
  pipelineUrl: string | null;
};

export type BuildStatusResult = {
  projectDockerfileReady: boolean;
  projectCiReady: boolean;
  sourceType: "REPO" | "GROUP" | null;
  services: BuildServiceStatus[];
};

export const buildService = {
  async detect(
    projectId: string,
    serviceId?: string,
  ): Promise<BuildDetectResult> {
    const res = await api.get<BuildDetectResult>(
      `/projects/${projectId}/build/detect`,
      {
        params: serviceId ? { serviceId } : undefined,
      },
    );
    return res.data;
  },

  async prepare(
    projectId: string,
    serviceId?: string,
    options?: { overwriteDockerfile?: boolean; overwriteGitlabCi?: boolean },
  ): Promise<BuildPrepareResult> {
    const res = await api.post<BuildPrepareResult>(
      `/projects/${projectId}/build/generate`,
      options ?? {},
      {
        params: serviceId ? { serviceId } : undefined,
        timeout: BUILD_PREPARE_TIMEOUT_MS,
      },
    );
    return res.data;
  },

  async prepareAll(projectId: string): Promise<{ results: BuildAllResult[] }> {
    const res = await api.post<{ results: BuildAllResult[] }>(
      `/projects/${projectId}/build/generate-all`,
      undefined,
      { timeout: BUILD_PREPARE_TIMEOUT_MS },
    );
    return res.data;
  },

  async getBuildStatus(projectId: string): Promise<BuildStatusResult> {
    const res = await api.get<BuildStatusResult>(
      `/projects/${projectId}/build/status`,
    );
    return res.data;
  },

  async updateConfig(projectId: string, config: BuildConfig): Promise<void> {
    await api.put(`/projects/${projectId}/build/config`, config);
  },

  async pushFiles(projectId: string, serviceId?: string): Promise<void> {
    await api.post(`/projects/${projectId}/build/push-files`, undefined, {
      params: serviceId ? { serviceId } : undefined,
    });
  },

  async getTemplates(projectId: string): Promise<BuildTemplates> {
    const res = await api.get<BuildTemplates>(
      `/projects/${projectId}/build/templates`,
    );
    return res.data;
  },
};
