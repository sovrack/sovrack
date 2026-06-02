'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  FolderGit2,
  Globe,
  Layers,
  Loader2,
  Rocket,
  X,
} from 'lucide-react';
import { platformConfigService } from '@/services/platform-config.service';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { ProjectDetail } from '@/types/project';
import type { EnvName } from '@/types/environment';

/* ─── Step indicator ────────────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: 'Projet', icon: <FolderGit2 size={14} /> },
  { id: 2, label: 'Source Git', icon: <Globe size={14} /> },
  { id: 3, label: 'Créer', icon: <Rocket size={14} /> },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
      {STEPS.map((step, i) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} className="flex items-center shrink-0">
            <div className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all',
              active ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-app)]'
                : done ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : 'border-[var(--border)] text-[var(--text-muted)]',
            )}>
              {done ? <Check size={12} /> : step.icon}
            </div>
            {!active && !done && (
              <span className="ml-1.5 hidden text-xs text-[var(--text-muted)] sm:block">{step.label}</span>
            )}
            {(active || done) && (
              <span className={clsx('ml-1.5 hidden text-xs font-semibold sm:block', active ? 'text-[var(--text-primary)]' : 'text-green-400')}>{step.label}</span>
            )}
            {i < STEPS.length - 1 && (
              <div className={clsx('mx-2 h-px w-8 transition-all', done ? 'bg-green-500/40' : 'bg-[var(--border)]')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Field helpers ─────────────────────────────────────────────────────── */

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
        {label}{required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--text-secondary)]/10 disabled:opacity-60"
    />
  );
}

function Select({ value, onChange, children, disabled }: { value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 pr-8 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--text-secondary)] disabled:opacity-60"
      >
        {children}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
    </div>
  );
}

/* ─── Wizard state ───────────────────────────────────────────────────────── */

type WizardState = {
  name: string;
  description: string;
  providerId: string;
  sourceType: 'REPO' | 'GROUP';
  repoId: string;
  gitlabToken: string;
  infraServerId: string;
  infraEnvName: EnvName;
  autoDeploy: boolean;
  dockerfile: string;
  port: string;
};

/* ─── Step 1: Project info ───────────────────────────────────────────────── */

function Step1({ state, setState }: { state: WizardState; setState: (s: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Informations du projet</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Donnez un nom et une description à votre projet.</p>
      </div>
      <Field label="Nom du projet" required>
        <Input value={state.name} onChange={(v) => setState({ name: v })} placeholder="mon-projet-api" />
      </Field>
      <Field label="Description" hint="Optionnel — aide votre équipe à comprendre l'objectif du projet.">
        <textarea
          value={state.description}
          onChange={(e) => setState({ description: e.target.value })}
          placeholder="Description courte..."
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--text-secondary)] resize-none"
        />
      </Field>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs font-semibold text-blue-400">Ce wizard va :</p>
        <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Créer le projet et connecter votre dépôt GitLab</li>
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Configurer l&apos;environnement (STAGING/PRODUCTION)</li>
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Préparer les fichiers Docker et CI/CD automatiquement</li>
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Lancer le premier déploiement en un clic</li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Step 2: Git source ─────────────────────────────────────────────────── */

type ProviderInfo = {
  id: string;
  name: string;
  url: string;
  hasOAuth: boolean;
  oauthExpired: boolean;
  hasAdminToken: boolean;
};

function getProviderTokenStatus(p: ProviderInfo): 'ok' | 'expired' | 'missing' {
  if (p.hasAdminToken) return 'ok';
  if (p.hasOAuth && !p.oauthExpired) return 'ok';
  if (p.hasOAuth && p.oauthExpired) return 'expired';
  return 'missing';
}

function Step2({
  state,
  setState,
}: {
  state: WizardState;
  setState: (s: Partial<WizardState>) => void;
  projectId: string | null;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  useEffect(() => {
    platformConfigService.listGitlabProviders().then((list) => {
      const configured = list
        .filter((p) => p.status === 'CONFIGURED' || p.status === 'ACTION_REQUIRED')
        .map((p) => ({
          id: p.id,
          name: p.name,
          url: p.gitlabUrl,
          hasOAuth: p.oauthTokenConfigured,
          oauthExpired: p.oauthExpiresAt ? new Date(p.oauthExpiresAt) < new Date() : false,
          hasAdminToken: p.adminTokenConfigured,
        }));
      setProviders(configured);
      if (configured.length > 0 && !state.providerId) {
        const def = list.find((p) => p.isDefault) ?? list[0];
        setState({ providerId: def?.id ?? configured[0].id });
      }
    }).catch(() => {}).finally(() => setLoadingProviders(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadingProviders) return <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-muted)]"><Loader2 size={14} className="animate-spin" /> Chargement des providers…</div>;

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-6 text-center">
        <Globe size={24} className="mx-auto mb-3 text-amber-400" />
        <p className="font-semibold text-[var(--text-primary)]">Aucun provider GitLab configuré</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Configurez un provider dans <strong>Settings → Git Providers</strong>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Source Git</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Le provider et l&apos;ID sont <strong>obligatoires</strong> — le projet ne sera créé que si la connexion GitLab réussit.
        </p>
      </div>

      <Field label="Provider GitLab" required>
        <Select value={state.providerId} onChange={(v) => setState({ providerId: v, repoId: '', gitlabToken: '' })}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name} — {p.url}</option>
          ))}
        </Select>
        {/* Token status badge */}
        {(() => {
          const p = providers.find((x) => x.id === state.providerId);
          if (!p) return null;
          const status = getProviderTokenStatus(p);
          if (status === 'ok') return (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-green-400">
              <CheckCircle2 size={11} /> Token valide configuré — connexion automatique
            </p>
          );
          if (status === 'expired') return (
            <p className="mt-1.5 text-xs text-amber-400">
              ⚠ Token OAuth expiré — entrez un PAT ci-dessous ou reconnectez OAuth dans Settings → Git Providers.
            </p>
          );
          return (
            <p className="mt-1.5 text-xs text-red-400">
              ✕ Aucun token configuré — entrez un PAT ci-dessous ou configurez-en un dans Settings → Git Providers.
            </p>
          );
        })()}
      </Field>

      {/* Source type: REPO or GROUP */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Type de source</p>
        <div className="grid grid-cols-2 gap-3">
          {(['REPO', 'GROUP'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setState({ sourceType: type, repoId: '' })}
              className={clsx(
                'flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition',
                state.sourceType === type
                  ? 'border-[var(--text-primary)] bg-[var(--hover)]'
                  : 'border-[var(--border)] hover:bg-[var(--hover)]',
              )}
            >
              {type === 'REPO'
                ? <FolderGit2 size={20} className="text-[var(--text-secondary)]" />
                : <Layers size={20} className="text-[var(--text-secondary)]" />}
              <span className="text-sm font-semibold text-[var(--text-primary)]">{type === 'REPO' ? 'Repository' : 'Group'}</span>
              <p className="text-xs text-[var(--text-muted)]">
                {type === 'REPO' ? 'Un seul dépôt GitLab' : 'Tous les dépôts d\'un groupe'}
              </p>
            </button>
          ))}
        </div>
      </div>

      <Field
        label={state.sourceType === 'GROUP' ? 'ID du groupe GitLab' : 'ID du repository GitLab'}
        required
        hint="Trouvez l'ID dans GitLab → Settings → General de votre repo ou groupe."
      >
        <input
          type="number"
          value={state.repoId}
          onChange={(e) => setState({ repoId: e.target.value })}
          placeholder={state.sourceType === 'GROUP' ? 'ex: 456' : 'ex: 123'}
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-zinc-500/20"
        />
      </Field>

      {/* PAT field — shown only when token is missing or expired */}
      {(() => {
        const p = providers.find((x) => x.id === state.providerId);
        const status = p ? getProviderTokenStatus(p) : 'missing';
        const required = status !== 'ok';
        return (
          <Field
            label="Personal Access Token"
            required={required}
            hint={required
              ? 'Obligatoire — créez un token dans GitLab → User Settings → Access Tokens (scope : api).'
              : 'Optionnel — laissez vide pour utiliser le token du provider.'}
          >
            <input
              type="password"
              value={state.gitlabToken}
              onChange={(e) => setState({ gitlabToken: e.target.value })}
              placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
              className={`h-11 w-full rounded-xl border px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-zinc-500/20 ${
                required
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-[var(--border)] bg-[var(--bg-card)]'
              }`}
            />
          </Field>
        );
      })()}

      {state.repoId && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2.5">
          <CheckCircle2 size={13} className="shrink-0 text-green-400" />
          <span className="font-mono text-xs text-[var(--text-secondary)]">
            {state.sourceType === 'GROUP' ? 'Groupe' : 'Repo'} ID: <strong>{state.repoId}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Step 3: Result ─────────────────────────────────────────────────────── */

function Step3({ state, result }: { state: WizardState; result: { project: ProjectDetail | null; error: string | null; creating: boolean } }) {
  if (result.creating) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
        <Loader2 size={32} className="animate-spin text-[var(--text-secondary)]" />
        <p className="text-base font-semibold text-[var(--text-primary)]">Configuration en cours…</p>
        <p className="text-sm text-[var(--text-secondary)]">Création du projet, connexion GitLab, configuration de l&apos;environnement…</p>
      </div>
    );
  }

  if (result.project) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-green-500/30 bg-green-500/10">
          <CheckCircle2 size={32} className="text-green-400" />
        </div>
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)]">Projet créé avec succès !</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            <strong>{result.project.name}</strong> est prêt et{' '}
            {state.repoId ? 'la source GitLab est connectée.' : 'aucune source GitLab configurée pour le moment.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Récapitulatif</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Vérifiez la configuration avant de créer le projet.</p>
      </div>

      {result.error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{result.error}</div>
      )}

      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        {[
          { label: 'Projet', value: state.name || '—' },
          { label: 'Description', value: state.description || '—' },
          { label: 'Source', value: state.repoId ? `${state.sourceType} ID: ${state.repoId}` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>
            <span className="font-mono text-xs text-[var(--text-primary)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────────────────── */

export type ProjectSetupWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
};

export function ProjectSetupWizard({ open, onClose, onCreated }: ProjectSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<ProjectDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const initialState: WizardState = {
    name: '', description: '',
    providerId: '', sourceType: 'REPO', repoId: '', gitlabToken: '',
    infraServerId: '', infraEnvName: 'STAGING', autoDeploy: true,
    dockerfile: 'Dockerfile', port: '3000',
  };

  const [state, setStateRaw] = useState<WizardState>(initialState);

  const setState = useCallback((patch: Partial<WizardState>) => setStateRaw((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    if (!open) {
      setStep(1); setCreatedProjectId(null); setCreatedProject(null);
      setCreating(false); setCreateError(null);
      setStateRaw(initialState);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = useMemo(() => {
    if (step === 1) return state.name.trim().length >= 2;
    if (step === 2) return !!(state.providerId && state.repoId.trim());
    return true;
  }, [step, state]);

  const handleFinish = async () => {
    setCreating(true);
    setCreateError(null);
    let projectId: string | null = null;
    try {
      // 1. Créer le projet
      const project = await projectsService.create({
        name: state.name.trim(),
        description: state.description.trim() || undefined,
      });
      projectId = project.id;

      // 2. Connecter la source GitLab — obligatoire
      try {
        await projectsService.connectGitlab(project.id, {
          providerId: state.providerId,
          gitlabId: state.sourceType === 'REPO' ? parseInt(state.repoId) : undefined,
          gitlabGroupId: state.sourceType === 'GROUP' ? parseInt(state.repoId) : undefined,
          sourceType: state.sourceType,
          gitlabToken: state.gitlabToken.trim() || undefined,
        });
      } catch (gitlabErr) {
        // Connexion GitLab échouée → supprimer le projet pour éviter un état cassé
        await projectsService.remove(project.id).catch(() => {});
        throw new Error(`Connexion GitLab échouée : ${getApiErrorMessage(gitlabErr)}`);
      }

      setCreatedProject(project);
      setStep(3);
    } catch (err) {
      setCreateError(getApiErrorMessage(err));
      if (projectId) setCreatedProjectId(null);
    } finally {
      setCreating(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) { setStep(2); return; }
    if (step === 2) { await handleFinish(); return; }
    if (step === 3 && createdProject) { onCreated(createdProject.id); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={creating ? undefined : onClose} />
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Nouveau projet</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Configuration guidée étape par étape</p>
          </div>
          <button type="button" onClick={onClose} disabled={creating} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--hover)] disabled:opacity-40">
            <X size={13} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="border-b border-[var(--border)] px-6 py-3">
          <StepIndicator current={step} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {createError && step === 2 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{createError}</div>
          )}
          {step === 1 && <Step1 state={state} setState={setState} />}
          {step === 2 && <Step2 state={state} setState={setState} projectId={createdProjectId} />}
          {step === 3 && <Step3 state={state} result={{ project: createdProject, error: createError, creating }} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <button
            type="button"
            onClick={() => step > 1 && step < 3 && !creating ? setStep((s) => s - 1) : onClose}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-40"
          >
            {step > 1 && !createdProject ? <><ArrowLeft size={14} /> Précédent</> : 'Annuler'}
          </button>

          {step === 1 && (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={!canNext}
              className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
            >
              Suivant <ArrowRight size={14} />
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={!canNext || creating}
              className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
            >
              {creating ? <><Loader2 size={14} className="animate-spin" /> Création…</> : <><Rocket size={14} /> Créer le projet</>}
            </button>
          )}

          {step === 3 && createdProject && (
            <button
              type="button"
              onClick={() => onCreated(createdProject.id)}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
            >
              <Layers size={14} /> Ouvrir le projet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
