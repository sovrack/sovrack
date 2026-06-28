// Pure helpers extracted from GitProviderConfigService (P2 split).
// No I/O, no `this`, no crypto/prisma/http — URL shaping, value normalization
// and DB-row → public-DTO mapping (incl. the provider status state machines).
// Kept side-effect free so each piece is unit-testable in isolation.

import { BadRequestException } from '@nestjs/common';
import type { GitProviderConfig } from '@prisma/client';

export type GitProviderStatus =
  | 'NOT_CONFIGURED'
  | 'ACTION_REQUIRED'
  | 'CONFIGURED';

export type GitlabProviderPublic = {
  id: string;
  name: string;
  type: 'GITLAB' | 'GITHUB' | 'GITEA';
  /** Base URL for the provider (gitlab.example.com or github.com). */
  providerUrl: string;
  internalUrl: string;
  redirectUri: string;
  applicationId: string;
  applicationSecretConfigured: boolean;
  groupNames: string;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
  status: GitProviderStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── URL helpers ───────────────────────────────────────────────────────────

/** Strip trailing slashes from a base URL. */
export function normalizeGitlabBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Infer the container registry URL for a GitLab instance from its base URL. */
export function inferGitlabRegistryUrl(gitlabUrl: string): string {
  const normalized = gitlabUrl.trim().replace(/\/$/, '');
  if (
    ['https://gitlab.com', 'http://gitlab.com', 'gitlab.com'].includes(
      normalized,
    )
  ) {
    return 'https://registry.gitlab.com';
  }
  try {
    const url = new URL(
      normalized.startsWith('http') ? normalized : `https://${normalized}`,
    );
    return `https://registry.${url.hostname}`;
  } catch {
    return `https://registry.${normalized}`;
  }
}

/** Resolve the REST API base for a GitHub provider (github.com vs Enterprise). */
export function buildGithubApiBase(providerUrl: string): string {
  const url = providerUrl.replace(/\/+$/, '');
  if (url === 'https://github.com' || url === 'http://github.com') {
    return 'https://api.github.com';
  }
  return `${url}/api/v3`;
}

// ─── Value helpers ─────────────────────────────────────────────────────────

/** Trim + collapse empty strings to null. */
export function normalizeOptional(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Trim and reject empty values with a 400. */
export function requireNonEmpty(value: string, errorMessage: string): string {
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(errorMessage);
  return normalized;
}

// ─── DB row → public DTO mappers (with status state machines) ───────────────

/**
 * GitLab status: needs URL + appId + appSecret (OAuth app) to be usable; once
 * those exist, a token (OAuth or admin) flips it to CONFIGURED.
 */
export function toGitlabProviderPublic(
  provider: GitProviderConfig,
): GitlabProviderPublic {
  const hasAppSecret = Boolean(provider.applicationSecret);
  const hasOauth = Boolean(provider.oauthAccessToken);
  const hasAdminToken = Boolean(provider.adminToken);

  let status: GitProviderStatus = 'NOT_CONFIGURED';
  if (provider.providerUrl || provider.applicationId || hasAppSecret) {
    if (!provider.providerUrl || !provider.applicationId || !hasAppSecret) {
      status = 'ACTION_REQUIRED';
    } else {
      status = hasOauth || hasAdminToken ? 'CONFIGURED' : 'ACTION_REQUIRED';
    }
  }

  return {
    id: provider.id,
    name: provider.name,
    type: 'GITLAB',
    providerUrl: provider.providerUrl,
    internalUrl: provider.internalUrl ?? '',
    redirectUri: provider.redirectUri ?? '',
    applicationId: provider.applicationId ?? '',
    applicationSecretConfigured: hasAppSecret,
    groupNames: provider.groupNames ?? '',
    adminTokenConfigured: hasAdminToken,
    oauthTokenConfigured: hasOauth,
    oauthExpiresAt: provider.oauthExpiresAt?.toISOString() ?? null,
    status,
    isDefault: provider.isDefault,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

/**
 * GitHub status: a PAT (adminToken) or a non-expired OAuth token => CONFIGURED;
 * an expired OAuth token => ACTION_REQUIRED (re-auth needed).
 */
export function toGithubProviderPublic(
  provider: GitProviderConfig,
): GitlabProviderPublic {
  const isOAuthExpired = provider.oauthExpiresAt
    ? provider.oauthExpiresAt < new Date()
    : false;
  const oauthTokenConfigured = Boolean(provider.oauthAccessToken);
  const adminTokenConfigured = Boolean(provider.adminToken);
  const applicationSecretConfigured = Boolean(provider.applicationSecret);

  let status: GitProviderStatus = 'NOT_CONFIGURED';
  if (adminTokenConfigured || (oauthTokenConfigured && !isOAuthExpired)) {
    status = 'CONFIGURED';
  } else if (oauthTokenConfigured && isOAuthExpired) {
    status = 'ACTION_REQUIRED';
  }

  return {
    id: provider.id,
    name: provider.name,
    type: 'GITHUB' as const,
    providerUrl: provider.providerUrl,
    internalUrl: provider.internalUrl ?? '',
    redirectUri: provider.redirectUri ?? '',
    applicationId: provider.applicationId ?? '',
    applicationSecretConfigured,
    groupNames: provider.groupNames ?? '',
    adminTokenConfigured,
    oauthTokenConfigured,
    oauthExpiresAt: provider.oauthExpiresAt?.toISOString() ?? null,
    status,
    isDefault: provider.isDefault,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

/** Gitea uses the same PAT-based shape as GitHub, only the type tag differs. */
export function toGiteaProviderPublic(
  provider: GitProviderConfig,
): GitlabProviderPublic {
  return { ...toGithubProviderPublic(provider), type: 'GITEA' as const };
}
