'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type {
  CreateGitlabProviderPayload,
  GitlabProvider,
  UpdateGitlabProviderPayload,
} from '@/features/platform';
import { PROVIDER_META, ProviderLogo, type ProviderType } from './provider-meta';
import { ProviderCredentialsStep } from './provider-credentials-step';
import {
  AuthMethodCard,
  Collapsible,
  Field,
  StepIndicator,
  TextInput,
  Toggle,
  type AuthChoice,
} from './provider-form-fields';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type DialogMode = 'create' | 'edit';

export type ProviderFormData = {
  // Step 2 — Instance
  name: string;
  gitlabUrl: string;
  internalUrl: string;
  isDefault: boolean;
  // Step 4 — OAuth
  applicationId: string;
  applicationSecret: string;
  redirectUri: string;
  groupNames: string;
  // Step 5 — PAT
  adminToken: string;
  // State from existing record
  applicationSecretConfigured: boolean;
  adminTokenConfigured: boolean;
  oauthTokenConfigured: boolean;
  oauthExpiresAt: string | null;
};

export type AddProviderDialogProps = {
  open: boolean;
  mode: DialogMode;
  existingProvider?: GitlabProvider | null;
  initialProviderType?: 'GITLAB' | 'GITHUB' | 'GITEA';
  fallbackRedirectUri: string;
  saving: boolean;
  error: string | null;
  copiedRedirect: boolean;
  onSave: (payload: CreateGitlabProviderPayload | UpdateGitlabProviderPayload, providerType?: 'GITLAB' | 'GITHUB' | 'GITEA') => Promise<void>;
  onClose: () => void;
  onCopyRedirectUri: (value: string) => void;
};

/* ─── Dialog ─────────────────────────────────────────────────────────────── */

export function AddProviderDialog({
  open,
  mode,
  existingProvider,
  initialProviderType = 'GITLAB',
  fallbackRedirectUri,
  saving,
  error,
  copiedRedirect,
  onSave,
  onClose,
  onCopyRedirectUri,
}: AddProviderDialogProps) {
  const isEdit = mode === 'edit';

  // In edit mode we skip step 1 (provider type already known)
  const [step, setStep] = useState(isEdit ? 2 : 1);
  const [selectedType, setSelectedType] = useState<ProviderType>(initialProviderType);
  const [authChoice, setAuthChoice] = useState<AuthChoice>('both');

  const [form, setForm] = useState<ProviderFormData>({
    name: '',
    gitlabUrl: 'https://gitlab.com',
    internalUrl: '',
    isDefault: false,
    applicationId: '',
    applicationSecret: '',
    redirectUri: '',
    groupNames: '',
    adminToken: '',
    applicationSecretConfigured: false,
    adminTokenConfigured: false,
    oauthTokenConfigured: false,
    oauthExpiresAt: null,
  });

  // Set default URL when provider type changes in create mode
  useEffect(() => {
    if (!isEdit && step === 1) {
      const defaultUrl =
        selectedType === 'GITHUB'
          ? 'https://github.com'
          : selectedType === 'GITEA'
            ? ''
            : 'https://gitlab.com';
      setForm((prev) => ({ ...prev, gitlabUrl: defaultUrl }));
    }
  }, [selectedType, isEdit, step]);

  // Populate form when editing
  useEffect(() => {
    if (isEdit && existingProvider) {
      setForm({
        name: existingProvider.name,
        gitlabUrl: existingProvider.gitlabUrl,
        internalUrl: existingProvider.internalUrl,
        isDefault: existingProvider.isDefault,
        applicationId: existingProvider.applicationId,
        applicationSecret: '',
        redirectUri: existingProvider.redirectUri || fallbackRedirectUri,
        groupNames: existingProvider.groupNames,
        adminToken: '',
        applicationSecretConfigured: existingProvider.applicationSecretConfigured,
        adminTokenConfigured: existingProvider.adminTokenConfigured,
        oauthTokenConfigured: existingProvider.oauthTokenConfigured,
        oauthExpiresAt: existingProvider.oauthExpiresAt,
      });
      // Infer authChoice from existing config
      const hasOAuth = existingProvider.applicationId || existingProvider.applicationSecretConfigured;
      const hasPat = existingProvider.adminTokenConfigured;
      if (hasOAuth && hasPat) setAuthChoice('both');
      else if (hasOAuth) setAuthChoice('oauth');
      else setAuthChoice('pat');
      setStep(2);
    } else if (!isEdit) {
      setStep(1);
      setForm((prev) => ({ ...prev, redirectUri: fallbackRedirectUri }));
    }
  }, [isEdit, existingProvider, fallbackRedirectUri, open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(isEdit ? 2 : 1);
    }
  }, [open, isEdit]);

  const set = <K extends keyof ProviderFormData>(k: K, v: ProviderFormData[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const effectiveRedirectUri = (form.redirectUri || fallbackRedirectUri).trim();

  const totalSteps = isEdit ? 3 : 4; // edit: Instance→Auth→Configure; create: Provider→Instance→Auth→Configure
  const stepOffset = isEdit ? 1 : 0; // shifts display step numbers

  const canProceed = useMemo(() => {
    if (step === 1) return PROVIDER_META[selectedType]?.available === true;
    if (step === 2) return form.name.trim().length > 0 && form.gitlabUrl.trim().length > 0;
    return true;
  }, [step, selectedType, form.name, form.gitlabUrl]);

  const showOAuth = authChoice === 'oauth' || authChoice === 'both';
  const showPAT = authChoice === 'pat' || authChoice === 'both';

  const handleSubmit = async () => {
    if (isEdit && existingProvider) {
      const payload: UpdateGitlabProviderPayload = {
        name: form.name.trim(),
        gitlabUrl: form.gitlabUrl.trim(),
        internalUrl: form.internalUrl.trim(),
        redirectUri: effectiveRedirectUri,
        applicationId: form.applicationId.trim(),
        groupNames: form.groupNames.trim(),
        isDefault: form.isDefault,
      };
      if (form.applicationSecret.trim()) payload.applicationSecret = form.applicationSecret.trim();
      if (form.adminToken.trim()) payload.adminToken = form.adminToken.trim();
      await onSave(payload);
    } else {
      const payload: CreateGitlabProviderPayload = {
        name: form.name.trim(),
        gitlabUrl: form.gitlabUrl.trim(),
        internalUrl: form.internalUrl.trim(),
        redirectUri: effectiveRedirectUri,
        applicationId: form.applicationId.trim(),
        applicationSecret: form.applicationSecret.trim(),
        groupNames: form.groupNames.trim(),
        adminToken: form.adminToken.trim(),
        isDefault: form.isDefault,
      };
      await onSave(
        payload,
        selectedType === 'GITHUB' ? 'GITHUB' : selectedType === 'GITEA' ? 'GITEA' : 'GITLAB',
      );
    }
  };

  if (!open) return null;

  const displayStep = step - stepOffset;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {isEdit ? 'Edit Git Provider' : 'Connect Git Provider'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {isEdit
                ? 'Update provider configuration and credentials'
                : 'Add a global reusable Git integration for your projects'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator current={displayStep} total={totalSteps} />
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ maxHeight: '70vh' }}>
          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── STEP 1: Provider type ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Select Provider
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Choose the Git platform for this integration.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(['GITLAB', 'GITHUB', 'GITEA'] as ProviderType[]).map((type) => {
                  const meta = PROVIDER_META[type];
                  const active = selectedType === type && meta.available;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => meta.available && setSelectedType(type)}
                      disabled={!meta.available}
                      className={clsx(
                        'relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition',
                        active
                          ? 'border-[var(--text-primary)] bg-[var(--hover)]'
                          : meta.available
                            ? 'border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--hover)]'
                            : 'cursor-not-allowed border-[var(--border)] opacity-50',
                      )}
                    >
                      <div
                        className={clsx(
                          'flex h-10 w-10 items-center justify-center rounded-xl border',
                          meta.bgColor,
                          meta.borderColor,
                        )}
                      >
                        <ProviderLogo type={type} className={clsx('h-5 w-5', meta.color)} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {meta.label}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)]">{meta.tagline}</p>
                      </div>
                      {!meta.available && (
                        <span className="absolute right-2 top-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                          {meta.badge ?? 'Soon'}
                        </span>
                      )}
                      {meta.available && meta.badge && !active && (
                        <span className="absolute right-2 top-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-teal-400">
                          {meta.badge}
                        </span>
                      )}
                      {active && (
                        <CheckCircle2 size={14} className="absolute right-2 top-2 text-green-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── STEP 2: Instance configuration ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Instance Configuration
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Configure the provider name and instance URL.
                </p>
              </div>

              <Field label="Provider Name" required>
                <TextInput
                  value={form.name}
                  onChange={(v) => set('name', v)}
                  placeholder="e.g. GitLab Cloud, Company GitLab"
                />
              </Field>

              <Field
                label={`${PROVIDER_META[selectedType]?.label ?? 'Git'} URL`}
                required
                hint={
                  selectedType === 'GITHUB'
                    ? 'Use https://github.com for GitHub.com, or your GitHub Enterprise URL.'
                    : selectedType === 'GITEA'
                      ? 'Enter your self-hosted Gitea instance URL, e.g. https://git.example.com.'
                      : 'Use https://gitlab.com for the cloud version, or your self-hosted instance URL.'}
              >
                <TextInput
                  value={form.gitlabUrl}
                  onChange={(v) => set('gitlabUrl', v)}
                  placeholder="https://gitlab.com"
                />
              </Field>

              <Collapsible title="Advanced instance options">
                <Field
                  label="Internal URL"
                  hint="Optional internal URL for Vaytek-to-GitLab communication (behind a firewall)."
                >
                  <TextInput
                    value={form.internalUrl}
                    onChange={(v) => set('internalUrl', v)}
                    placeholder="https://gitlab.internal.company.com"
                  />
                </Field>
              </Collapsible>

              <Toggle
                value={form.isDefault}
                onChange={(v) => set('isDefault', v)}
                label="Set as default provider"
                hint="Projects will use this provider by default when connecting a repository."
              />
            </div>
          )}

          {/* ── STEP 3: Auth method ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                  Authentication Method
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Choose how Vaytek authenticates with this provider.
                </p>
              </div>

              <div className="space-y-2">
                {(['oauth', 'pat', 'both'] as AuthChoice[]).map((choice) => (
                  <AuthMethodCard
                    key={choice}
                    choice={choice}
                    selected={authChoice === choice}
                    onSelect={() => setAuthChoice(choice)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4: Configure credentials ── */}
          {step === 4 && (
            <ProviderCredentialsStep
              providerType={selectedType}
              isEdit={isEdit}
              showOAuth={showOAuth}
              showPAT={showPAT}
              effectiveRedirectUri={effectiveRedirectUri}
              copiedRedirect={copiedRedirect}
              applicationId={form.applicationId}
              applicationSecret={form.applicationSecret}
              applicationSecretConfigured={form.applicationSecretConfigured}
              groupNames={form.groupNames}
              adminToken={form.adminToken}
              adminTokenConfigured={form.adminTokenConfigured}
              onRedirectUriChange={(v) => set('redirectUri', v)}
              onCopyRedirectUri={onCopyRedirectUri}
              onApplicationIdChange={(v) => set('applicationId', v)}
              onApplicationSecretChange={(v) => set('applicationSecret', v)}
              onGroupNamesChange={(v) => set('groupNames', v)}
              onAdminTokenChange={(v) => set('adminToken', v)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {step > (isEdit ? 2 : 1) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  icon={<ArrowLeft size={13} />}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>

              {step < (isEdit ? 4 : 4) ? (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canProceed}
                  icon={<ArrowRight size={13} />}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => void handleSubmit()}
                  loading={saving}
                  disabled={saving}
                  icon={saving ? undefined : <Check size={13} />}
                >
                  {isEdit ? 'Save Changes' : 'Add Provider'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
