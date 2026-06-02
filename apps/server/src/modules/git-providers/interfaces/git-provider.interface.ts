import { Role } from '@prisma/client';

export type RepoItem = {
  id: number;
  name: string;
  fullName: string;
  httpUrl: string;
  defaultBranch: string;
  description?: string | null;
};

export type BranchItem = {
  name: string;
  isDefault: boolean;
  commitSha?: string;
};

export type PipelineItem = {
  id: number;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  createdAt?: string;
};

export type WebhookResult = { status: 'ok' | 'ignored' };

/**
 * Contrat commun pour tous les providers Git (GitLab, GitHub, Gitea, etc.).
 * Chaque provider implémente ces opérations à sa façon.
 */
export interface IGitProvider {
  /** Lister les repos accessibles via ce provider */
  listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]>;

  /** Lister les branches d'un projet connecté */
  listBranches(projectId: string, userId: string, userRole: Role): Promise<BranchItem[]>;

  /** Lister les pipelines / workflow runs */
  listPipelines(projectId: string, userId: string, userRole: Role): Promise<PipelineItem[]>;

  /** Déclencher un pipeline ou un workflow */
  triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<PipelineItem>;

  /** Traiter un webhook entrant */
  handleWebhook(payload: unknown): Promise<WebhookResult>;

  /** Vérifier l'authenticité d'un webhook */
  verifyWebhookToken(token: string | undefined, payload?: Record<string, unknown>): Promise<void>;
}
