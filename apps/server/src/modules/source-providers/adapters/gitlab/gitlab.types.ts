import type { SourceType } from '@prisma/client';

/**
 * Config GitLab résolue pour un projet/service (fusion gitProviderConfig + repo
 * du service). L'index signature tolère les champs hérités de gitProviderConfig
 * sans les énumérer ; les champs explicites portent leur vrai type.
 */
export type GitlabResolvedConfig = {
  providerUrl: string;
  providerToken: string;
  sourceType?: SourceType | null;
  repoPath?: string | null;
  externalId?: number | string | null;
  externalGroupId?: number | string | null;
  providerId?: string | null;
  defaultBranch?: string | null;
  registryUrl?: string | null;
  deployTokenUsername?: string | null;
  deployTokenValue?: string | null;
  adminToken?: string | null;
  oauthAccessToken?: string | null;
  webhookSecret?: string | null;
  id?: string;
  projectId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
};

export type PublicGitlabConfig = {
  id: string;
  gitlabUrl: string;
  gitlabId: number | null;
  gitlabGroupId: number | null;
  defaultBranch: string;
  sourceType: SourceType;
  providerId: string | null;
  deployTokenUsername: string | null;
  registryUrl: string | null;
  gitlabToken: string;
  deployTokenValue: string;
  webhookSecretConfigured: boolean;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
};
