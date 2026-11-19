"use client";

import { Check, Copy, Key, Shield } from "lucide-react";
import type { ProviderType } from "./provider-meta";
import { Collapsible, SecretInput, TextInput } from "./provider-form-fields";
import { FormField } from "@/shared/ui/form-field";

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
  const isGithub = providerType === "GITHUB";
  const tokenLabel = isGithub
    ? "Jeton d’accès personnel"
    : "Jeton administrateur";

  return (
    <div className="space-y-5">
      {showOAuth && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-blue-400" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Application OAuth
            </p>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">
              Instructions de configuration
            </p>
            {isGithub ? (
              <>
                <p>
                  1. Ouvrez GitHub →{" "}
                  <strong>
                    Settings → Developer settings → OAuth Apps → New OAuth App
                  </strong>
                </p>
                <p>
                  2. Renseignez l’URL d’accueil et l’URL de rappel ci-dessous.
                </p>
                <p>3. Copiez le Client ID et le Client Secret ci-dessous.</p>
              </>
            ) : (
              <>
                <p>
                  1. Ouvrez GitLab →{" "}
                  <strong>Admin → Applications → New application</strong>
                </p>
                <p>
                  2. Renseignez le nom et l’URI de redirection, puis activez :{" "}
                  <code className="font-mono bg-[var(--hover)] px-1 rounded">
                    api read_user openid
                  </code>
                </p>
                <p>
                  3. Copiez l’identifiant et le secret de l’application
                  ci-dessous.
                </p>
              </>
            )}
          </div>

          <FormField
            label="URI de redirection"
            hint="Copiez cette URL dans le champ URI de redirection de l’application OAuth."
          >
            <div className="flex gap-2">
              <TextInput
                value={effectiveRedirectUri}
                onChange={onRedirectUriChange}
                readOnly
                className="font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => onCopyRedirectUri(effectiveRedirectUri)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
              >
                {copiedRedirect ? (
                  <Check size={13} className="text-green-400" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          </FormField>

          <FormField label="Application ID">
            <TextInput
              value={applicationId}
              onChange={onApplicationIdChange}
              placeholder="GitLab Application ID"
            />
          </FormField>

          <FormField label="Secret de l’application">
            <SecretInput
              value={applicationSecret}
              onChange={onApplicationSecretChange}
              placeholder="GitLab Application Secret"
              alreadySet={isEdit && applicationSecretConfigured}
              label="Secret de l’application"
            />
          </FormField>

          <Collapsible title="Restrictions par groupe (facultatif)">
            <FormField
              label="Groupes autorisés"
              hint="Chemins de groupes GitLab séparés par des virgules. Laissez vide pour tout autoriser."
            >
              <TextInput
                value={groupNames}
                onChange={onGroupNamesChange}
                placeholder="company, company/team"
              />
            </FormField>
          </Collapsible>
        </div>
      )}

      {showOAuth && showPAT && (
        <div className="border-t border-[var(--border)]" />
      )}

      {showPAT && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-amber-400" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Jeton d’accès personnel
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-[var(--text-secondary)] space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">
              {isGithub
                ? "Permissions du jeton GitHub"
                : "Permissions requises"}
            </p>
            {isGithub ? (
              <div className="mt-1.5 space-y-1 leading-5">
                <p>
                  Préférez un jeton à permissions fines limité aux dépôts gérés
                  par Sovrack.
                </p>
                <p>
                  Permissions du dépôt : <strong>Contents (read/write)</strong>,{" "}
                  <strong>Actions (read/write)</strong> et{" "}
                  <strong>Webhooks (read/write)</strong>. GitHub ajoute
                  automatiquement l’accès en lecture aux métadonnées.
                </p>
                <p>
                  Alternative avec un jeton classique :{" "}
                  <code className="rounded bg-[var(--hover)] px-1">repo</code>{" "}
                  <code className="rounded bg-[var(--hover)] px-1">
                    workflow
                  </code>{" "}
                  <code className="rounded bg-[var(--hover)] px-1">
                    read:org
                  </code>
                  .
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[
                  "api",
                  "read_repository",
                  "write_repository",
                  "read_registry",
                ].map((scope) => (
                  <code
                    key={scope}
                    className="rounded bg-[var(--hover)] px-1.5 py-0.5 font-mono"
                  >
                    {scope}
                  </code>
                ))}
              </div>
            )}
            <p className="mt-1.5">
              {isGithub ? (
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-400 underline-offset-2 hover:underline"
                >
                  Créer un jeton à permissions fines sur GitHub
                </a>
              ) : (
                <>
                  Créez-le dans : <strong>User Settings → Access Tokens</strong>
                </>
              )}
            </p>
          </div>

          <FormField
            label={tokenLabel}
            required={!isEdit || !adminTokenConfigured}
            hint={
              isEdit && adminTokenConfigured
                ? "Laissez vide pour conserver le jeton chiffré actuellement configuré."
                : "Le jeton est chiffré au repos et ne sera plus jamais affiché."
            }
          >
            <SecretInput
              value={adminToken}
              onChange={onAdminTokenChange}
              placeholder={
                isGithub ? "<github-access-token>" : "<gitlab-access-token>"
              }
              alreadySet={isEdit && adminTokenConfigured}
              label={tokenLabel}
            />
          </FormField>
        </div>
      )}
    </div>
  );
}
