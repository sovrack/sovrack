'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CreateServerPayload } from '@/types/server';
import {
  validateServerForm,
  buildCreatePayload,
  createDefaultValues,
  type ServerFormValues,
  type ServerFormErrors,
} from './server-form.validation';

type ServerFormProps = {
  onSubmit: (payload: CreateServerPayload) => Promise<void>;
  loading?: boolean;
  error?: string | null;
};

const inputBase =
  'w-full rounded-xl border bg-[var(--bg-card)]/5 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:bg-[var(--bg-card)]/8 focus:ring-2';
const inputNormal = `${inputBase} border-[var(--border)] focus:border-[var(--border)] focus:ring-zinc-500/20`;
const inputError = `${inputBase} border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20`;
const inputMono = 'font-mono';

const radioBase = 'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-3 transition';
const radioActive = `${radioBase} border-[var(--border)] bg-[var(--text-primary)]/10`;
const radioInactive = `${radioBase} border-[var(--border)] bg-[var(--bg-card)]/3 hover:border-[var(--border)]`;

export function ServerForm({ onSubmit, loading = false, error }: ServerFormProps) {
  const [values, setValues] = useState<ServerFormValues>(createDefaultValues);
  const [formErrors, setFormErrors] = useState<ServerFormErrors>({});
  const set = <K extends keyof ServerFormValues>(key: K, value: ServerFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors, parsed } = validateServerForm('create', values);
    if (!parsed) {
      setFormErrors(errors);
      return;
    }
    await onSubmit(buildCreatePayload(parsed));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Connection mode */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Connection Mode
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className={radioActive}>
              <input
                type="radio"
                name="connectionMode"
                checked={true}
                onChange={() => {}}
                className="mt-0.5 accent-zinc-500"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--text-primary)]">SSH</span>
                <span className="block text-xs text-[var(--text-secondary)]">Direct access to the VPS.</span>
              </span>
            </label>
            {(['bastion', 'agent'] as const).map((mode) => (
              <label key={mode} className={`${radioInactive} cursor-not-allowed opacity-50`}>
                <input type="radio" disabled className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    {mode === 'bastion' ? 'Bastion' : 'Agent'}
                    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                      Coming soon
                    </span>
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {mode === 'bastion'
                      ? 'Reach private VPS through jump host.'
                      : 'Queue jobs for pull-based execution.'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Nom du serveur <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="VPS Production OVH"
            className={formErrors.name ? inputError : inputNormal}
          />
          {formErrors.name && <p className="mt-1 text-xs text-red-400">{formErrors.name}</p>}
        </div>

        {/* Host */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Host / IP <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={values.host}
            onChange={(e) => set('host', e.target.value)}
            placeholder="192.168.1.10 ou vps.exemple.com"
            className={`${formErrors.host ? inputError : inputNormal} ${inputMono}`}
          />
          {formErrors.host && <p className="mt-1 text-xs text-red-400">{formErrors.host}</p>}
        </div>

        {/* Port */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Port SSH
          </label>
          <input
            type="number"
            value={values.port}
            onChange={(e) => set('port', e.target.value)}
            min="1"
            max="65535"
            className={`${formErrors.port ? inputError : inputNormal} ${inputMono}`}
          />
          {formErrors.port && <p className="mt-1 text-xs text-red-400">{formErrors.port}</p>}
        </div>

        {/* Username */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
            Username SSH
          </label>
          <input
            type="text"
            value={values.username}
            onChange={(e) => set('username', e.target.value)}
            placeholder="ubuntu"
            className={`${formErrors.username ? inputError : inputNormal} ${inputMono}`}
          />
          {formErrors.username && <p className="mt-1 text-xs text-red-400">{formErrors.username}</p>}
        </div>

      </div>

      <button
        type="submit"
        disabled={loading || !values.name.trim() || !values.host.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-3 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        Créer le serveur
      </button>
    </form>
  );
}
