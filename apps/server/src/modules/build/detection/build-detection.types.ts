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
  recommendedBuildType: string;
  recommendedStartCommand: string;
  recommendedPort: number;
  reasons: string[];
};
