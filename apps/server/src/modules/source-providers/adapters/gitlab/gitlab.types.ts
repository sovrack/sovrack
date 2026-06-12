import type { SourceType } from '@prisma/client';

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
