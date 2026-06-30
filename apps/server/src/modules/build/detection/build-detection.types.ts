export type DetectConfidence = 'high' | 'medium' | 'low';

export type RepoTreeItem = {
  name: string;
  type: string;
  path?: string;
};

export type GitHubTreeItem = {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
};

export type BuildType =
  | 'nestjs'
  | 'nextjs'
  | 'react'
  | 'nodejs'
  | 'django'
  | 'python'
  | 'laravel'
  | 'php'
  | 'go'
  | 'spring-boot'
  | 'java'
  | 'dockerized'
  | 'static'
  | 'postgres-service'
  | 'redis-service'
  | 'unknown';

export type DetectResult = {
  type: string;
  confidence: DetectConfidence;
  language: string;
  framework: string;
  packageManager: string;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  recommendedStrategy:
    | 'docker'
    | 'docker-multi-stage'
    | 'nixpacks'
    | 'static-build'
    | 'service-container';
  recommendedBuildType: BuildType;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
};
