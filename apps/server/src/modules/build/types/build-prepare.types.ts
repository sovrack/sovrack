export type BuildArtifactStatus = 'CREATED' | 'UPDATED' | 'SKIPPED' | 'FAILED';
export type BuildPrepareStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';

export type BuildPrepareServiceResult = {
  serviceId: string;
  serviceName: string;
  status: BuildPrepareStatus;
  message: string;
  dockerfileStatus: BuildArtifactStatus;
  dockerignoreStatus: BuildArtifactStatus;
  ciStatus: BuildArtifactStatus;
  pipelineUrl: string | null;
};

export type BuildPrepareResponse = {
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
  ciConfigContent: string;
  ciConfigFilePath: string;
  serviceResult: BuildPrepareServiceResult;
};
