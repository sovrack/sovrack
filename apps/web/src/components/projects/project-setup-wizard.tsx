'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  CheckCircle2,
  FolderGit2,
  Loader2,
  Rocket,
  X,
} from 'lucide-react';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { ProjectDetail } from '@/types/project';

/* ─── Step indicator ────────────────────────────────────────────────────── */
// Dokploy model: a Project is a PURE logical container (name + description).
// The Git source / application is configured later, inside the project.

const STEPS = [
  { id: 1, label: 'Projet', icon: <FolderGit2 size={14} /> },
  { id: 2, label: 'Créé', icon: <Rocket size={14} /> },
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

/* ─── Wizard state ───────────────────────────────────────────────────────── */

type WizardState = {
  name: string;
  description: string;
};

/* ─── Step 1: Project info ───────────────────────────────────────────────── */

function Step1({ state, setState }: { state: WizardState; setState: (s: Partial<WizardState>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Nouveau projet</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Un projet est un <strong>conteneur logique</strong>. Donnez-lui un nom — vous ajouterez vos applications et leurs sources Git ensuite.
        </p>
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
        <p className="text-xs font-semibold text-blue-400">Prochaines étapes (dans le projet) :</p>
        <ul className="mt-1.5 space-y-1 text-xs text-[var(--text-secondary)]">
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Ajouter une application et connecter sa source (GitHub / GitLab)</li>
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Créer des environnements (staging / production)</li>
          <li className="flex items-start gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-green-400" /> Déployer l&apos;application sur l&apos;environnement choisi</li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Step 2: Result ─────────────────────────────────────────────────────── */

function StepResult({ result }: { result: { project: ProjectDetail | null; error: string | null; creating: boolean } }) {
  if (result.creating) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
        <Loader2 size={32} className="animate-spin text-[var(--text-secondary)]" />
        <p className="text-base font-semibold text-[var(--text-primary)]">Création du projet…</p>
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
            <strong>{result.project.name}</strong> est prêt. Ouvrez-le pour ajouter une application et connecter sa source Git.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {result.error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{result.error}</div>
      )}
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
  const [createdProject, setCreatedProject] = useState<ProjectDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const initialState: WizardState = { name: '', description: '' };
  const [state, setStateRaw] = useState<WizardState>(initialState);

  const setState = useCallback((patch: Partial<WizardState>) => setStateRaw((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => {
    if (!open) {
      setStep(1); setCreatedProject(null);
      setCreating(false); setCreateError(null);
      setStateRaw(initialState);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = state.name.trim().length >= 2;

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      // Dokploy model: creating a project just creates the logical container.
      // The Git source / application is connected later, inside the project.
      const project = await projectsService.create({
        name: state.name.trim(),
        description: state.description.trim() || undefined,
      });
      setCreatedProject(project);
      setStep(2);
    } catch (err) {
      setCreateError(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
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
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Un conteneur pour vos applications</p>
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
          {createError && step === 1 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{createError}</div>
          )}
          {step === 1 && <Step1 state={state} setState={setState} />}
          {step === 2 && <StepResult result={{ project: createdProject, error: createError, creating }} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--hover)] disabled:opacity-40"
          >
            {step === 2 && createdProject ? 'Fermer' : 'Annuler'}
          </button>

          {step === 1 && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!canCreate || creating}
              className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-5 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-40"
            >
              {creating ? <><Loader2 size={14} className="animate-spin" /> Création…</> : <><Rocket size={14} /> Créer le projet</>}
            </button>
          )}

          {step === 2 && createdProject && (
            <button
              type="button"
              onClick={() => onCreated(createdProject.id)}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
            >
              <Rocket size={14} /> Ouvrir le projet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
