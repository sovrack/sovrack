import api from '@/lib/api';

export type BuildDetectResult = {
  type: string;
  confidence: 'high' | 'medium' | 'low';
  language: string;
  framework: string;
  packageManager: string;
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasCiConfig: boolean;
  recommendedStrategy:
    | 'docker'
    | 'docker-multi-stage'
    | 'buildpack'
    | 'static-build'
    | 'service-container';
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
  gitlabCiContent: string;
};

export type BuildConfig = {
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

export const buildService = {
  /** Détecter le type de projet depuis GitLab */
  async detect(projectId: string): Promise<BuildDetectResult> {
    const res = await api.get<BuildDetectResult>(`/projects/${projectId}/build/detect`);
    return res.data;
  },

  /** Générer les fichiers, les pousser dans GitLab et configurer le webhook */
  async prepare(projectId: string): Promise<BuildPrepareResult> {
    const res = await api.post<BuildPrepareResult>(`/projects/${projectId}/build/prepare`);
    return res.data;
  },

  /** Mettre à jour la configuration de build d'un projet */
  async updateConfig(projectId: string, config: BuildConfig): Promise<void> {
    await api.put(`/projects/${projectId}/build/config`, config);
  },

  /** Pousser les fichiers déjà générés dans GitLab */
  async pushFiles(projectId: string): Promise<void> {
    await api.post(`/projects/${projectId}/build/push-files`);
  },

  /** Récupérer les types de projets supportés */
  async getTemplates(projectId: string): Promise<BuildTemplates> {
    const res = await api.get<BuildTemplates>(
      `/projects/${projectId}/build/templates`,
    );
    return res.data;
  },
};
