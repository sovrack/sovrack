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
 * Provider-agnostic registry credentials. Encapsulates the username +
 * password (and optionally the registry URL) needed to pull/push a
 * Docker image built by this provider's pipeline.
 */
export type RegistryCredentials = {
  username: string;
  password: string;
  registryUrl?: string | null;
};

/**
 * Credentials for git clone / git pull on the target VPS (local builds).
 * The token is the minimal-privilege credential for read-only repo access.
 */
export type GitCredentials = {
  repoUrl: string;
  token: string;
};

/**
 * Result returned after registering a webhook on the provider side.
 */
export type WebhookConfigResult = {
  hookId: string | number;
  url: string;
};

/**
 * Result of writing one or more files to a repo.
 * fileStatuses maps filePath → 'CREATED' | 'UPDATED' | 'SKIPPED'.
 */
export type RepoWriteResult = {
  branch: string;
  fileStatuses: Record<string, 'CREATED' | 'UPDATED' | 'SKIPPED'>;
};

/**
 * Contrat commun pour tous les providers Git (GitLab, GitHub, Gitea, etc.).
 * Chaque provider implémente ces opérations à sa façon.
 *
 * RULE: No other module calls GitLab/GitHub APIs directly.
 *       All provider communication goes through this interface.
 */
export interface IGitProvider {
  /** Type discriminant (returned by `SourceProvidersService.forType`). */
  readonly type: import('@prisma/client').GitProviderType;

  // ─── Repository operations ────────────────────────────────────────────────

  listRepos(projectId: string, userId: string, userRole: Role): Promise<RepoItem[]>;
  listBranches(projectId: string, userId: string, userRole: Role): Promise<BranchItem[]>;
  listPipelines(projectId: string, userId: string, userRole: Role): Promise<PipelineItem[]>;

  triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<PipelineItem>;

  resolveRepositoryPath(projectId: string, repoId?: number | string): Promise<string>;

  // ─── File operations (used by build module to push Dockerfile etc.) ───────

  /**
   * Read a file from the repository at the given ref (branch/commit).
   * Returns null if the file does not exist.
   */
  readFile(projectId: string, filePath: string, ref?: string): Promise<string | null>;

  /**
   * Write one or more files to the repository on the default branch.
   * Creates or updates each file. The CI config file (.gitlab-ci.yml,
   * .github/workflows/build.yml) is explicitly excluded from writes —
   * users must add it manually to avoid overwriting existing CI.
   */
  writeFiles(
    projectId: string,
    files: Record<string, string>,
    serviceId?: string,
  ): Promise<RepoWriteResult>;

  // ─── Webhook management (owned by source-providers, not build) ──────────────

  /**
   * Register (or update) a webhook on the provider side so that it
   * sends pipeline and push events to `webhookUrl`.
   * Idempotent: calling it multiple times with the same URL is safe.
   */
  configureWebhook(
    projectId: string,
    webhookUrl: string,
    secret: string,
    serviceId?: string,
  ): Promise<WebhookConfigResult>;

  // ─── Credentials ──────────────────────────────────────────────────────────

  /**
   * Resolve Docker registry credentials (docker login) for pulling the
   * image built by this provider's CI pipeline.
   */
  resolveRegistryCredentials(projectId: string): Promise<RegistryCredentials>;

  /**
   * Build the full Docker image reference for a project + branch.
   * Format: {registry}/{path}:{sanitized-branch}
   * Examples:
   *   GitLab → registry.gitlab.com/group/repo:main
   *   GitHub → ghcr.io/owner/repo:main
   * Falls back to `{slug}:{tag}` if no registry config is found.
   */
  resolveDockerImageRef(
    projectId: string,
    branch: string,
    serviceId?: string,
  ): Promise<string>;

  /**
   * Resolve Git credentials (token + repo URL) for a local VPS build
   * that needs to clone/pull the source code.
   */
  resolveGitCredentials(projectId: string, serviceId?: string): Promise<GitCredentials>;

  // NOTE: Webhook *reception* is no longer part of this contract. It lives
  // in the unified webhooks module via IWebhookHandler. Providers only
  // *register* webhooks here (configureWebhook above).
}
