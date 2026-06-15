'use client';

import { Check, Copy, Key, Shield } from 'lucide-react';
import type { ProviderType } from './provider-meta';
import {
  Collapsible,
  Field,
  SecretInput,
  TextInput,
} from './provider-form-fields';

export type ProviderCredentialsStepProps = {
  providerType: ProviderType;
  isEdit: boolean;
  showOAuth: boolean;
  showPAT: boolean;
  effectiveRedirectUri: string;
  copiedRedirect: boolean;
  applicationId: string;
  applicationSecret: string;
  applicationSecretConfigured: boolean;
  groupNames: string;
  adminToken: string;
  adminTokenConfigured: boolean;
  onRedirectUriChange: (value: string) => void;
  onCopyRedirectUri: (value: string) => void;
  onApplicationIdChange: (value: string) => void;
  onApplicationSecretChange: (value: string) => void;
  onGroupNamesChange: (value: string) => void;
  onAdminTokenChange: (value: string) => void;
};

export function ProviderCredentialsStep({
  providerType,
  isEdit,
  showOAuth,
  showPAT,
  effectiveRedirectUri,
  copiedRedirect,
  applicationId,
  applicationSecret,
  applicationSecretConfigured,
  groupNames,
  adminToken,
  adminTokenConfigured,
  onRedirectUriChange,
  onCopyRedirectUri,
  onApplicationIdChange,
  onApplicationSecretChange,
  onGroupNamesChange,
  onAdminTokenChange,
}: ProviderCredentialsStepProps) {
  const isGithub = providerType === 'GITHUB';
  // Gitea is PAT-only here (no OAuth app flow), so the OAuth section is hidden.
  const isGitea = providerType === 'GITEA';
  const tokenLabel = isGitea ? 'Access Token' : isGithub ? 'Personal Access Token' : 'Admin Token';

  return (
    <div className="space-y-5">
      {showOAuth && !isGitea && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-blue-400" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">OAuth App</p>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Setup instructions</p>
            {isGithub ? (
              <>
                <p>1. Open GitHub → <strong>Settings → Developer settings → OAuth Apps → New OAuth App</strong></p>
                <p>2. Set homepage URL and set callback URL (below).</p>
                <p>3. Copy the Client ID and Client Secret into the fields below.</p>
              </>
            ) : (
              <>
                <p>1. Open GitLab → <strong>Admin → Applications → New application</strong></p>
                <p>2. Set name, set redirect URI (below), enable scopes: <code className="font-mono bg-[var(--hover)] px-1 rounded">api read_user openid</code></p>
                <p>3. Copy the Application ID and Secret into the fields below.</p>
              </>
            )}
          </div>

          <Field label="Redirect URI" hint="Copy this URL into your GitLab OAuth Application redirect URI field.">
            <div className="flex gap-2">
              <TextInput
                value={effectiveRedirectUri}
                onChange={onRedirectUriChange}
                className="font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => onCopyRedirectUri(effectiveRedirectUri)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
              >
                {copiedRedirect ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              </button>
            </div>
          </Field>

          <Field label="Application ID">
            <TextInput
              value={applicationId}
              onChange={onApplicationIdChange}
              placeholder="GitLab Application ID"
            />
          </Field>

          <Field label="Application Secret">
            <SecretInput
              value={applicationSecret}
              onChange={onApplicationSecretChange}
              placeholder="GitLab Application Secret"
              alreadySet={isEdit && applicationSecretConfigured}
              label="Application Secret"
            />
          </Field>

          <Collapsible title="Group restrictions (optional)">
            <Field
              label="Allowed Groups"
              hint="Comma-separated GitLab group paths. Leave empty to allow all."
            >
              <TextInput
                value={groupNames}
                onChange={onGroupNamesChange}
                placeholder="company, company/team"
              />
            </Field>
          </Collapsible>
        </div>
      )}

      {showOAuth && showPAT && !isGitea && (
        <div className="border-t border-[var(--border)]" />
      )}

      {showPAT && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-amber-400" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Personal Access Token
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Required token scopes</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(isGitea
                ? ['repository', 'package', 'write:repository']
                : isGithub
                  ? ['repo', 'workflow', 'read:org', 'read:user']
                  : ['api', 'read_repository', 'write_repository', 'read_registry']
              ).map((scope) => (
                <code key={scope} className="rounded bg-[var(--hover)] px-1.5 py-0.5 font-mono">
                  {scope}
                </code>
              ))}
            </div>
            <p className="mt-1.5">
              Generate at:{' '}
              <strong>
                {isGitea
                  ? 'Settings → Applications → Generate New Token'
                  : isGithub
                    ? 'Settings → Developer settings → Personal access tokens'
                    : 'User Settings → Access Tokens'}
              </strong>
            </p>
          </div>

          <Field label={tokenLabel}>
            <SecretInput
              value={adminToken}
              onChange={onAdminTokenChange}
              placeholder={isGithub ? 'ghp_xxxxxxxxxxxxxxxxxxxx' : isGitea ? 'token xxxxxxxxxxxxxxxxxxxx' : 'glpat-xxxxxxxxxxxxxxxxxxxx'}
              alreadySet={isEdit && adminTokenConfigured}
              label={tokenLabel}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
