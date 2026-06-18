'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { ServerForm } from '@/components/servers/server-form';
import { getApiErrorMessage } from '@/lib/api';
import { serversService } from '@/services/servers.service';
import type { CreateServerPayload, CreateServerResult } from '@/types/server';

type SetupStep = 'form' | 'install' | 'validate' | 'done';

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

const STEPS: { key: SetupStep; label: string }[] = [
  { key: 'form', label: '1. Infos serveur' },
  { key: 'install', label: '2. Key install' },
  { key: 'validate', label: '3. Validation' },
  { key: 'done', label: '4. Ready ✅' },
];

export default function NewServerPage() {
  const router = useRouter();

  const [step, setStep] = useState<SetupStep>('form');
  const [createdServer, setCreatedServer] = useState<CreateServerResult | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);

  const handleCreate = async (payload: CreateServerPayload) => {
    setCreating(true);
    setCreateError(null);
    setInstallError(null);
    setInstallSuccess(null);
    setCopied(false);
    setTemporaryPassword('');

    try {
      const created = await serversService.create(payload);
      setCreatedServer(created);
      setStep('install');
    } catch (error) {
      setCreateError(getApiErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPublicKey = async () => {
    if (!createdServer?.sshPublicKey) return;
    try {
      await navigator.clipboard.writeText(createdServer.sshPublicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleKeyInstalled = async () => {
    if (!createdServer) return;
    const refreshed = await serversService.getById(createdServer.id);
    setCreatedServer(refreshed);
    setStep(createdServer.connectionMode === 'ssh' ? 'validate' : 'done');
  };

  const handleInstallKey = async () => {
    if (!createdServer) return;

    if (!temporaryPassword.trim()) {
      setInstallError('Le mot de passe temporaire VPS est obligatoire.');
      return;
    }

    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(null);
    try {
      const result = await serversService.installKey(createdServer.id, {
        password: temporaryPassword,
      });
      setInstallSuccess(result.message);
      await handleKeyInstalled();
    } catch (error) {
      setInstallError(getApiErrorMessage(error));
    } finally {
      setInstalling(false);
    }
  };

  const handleValidateAndDetect = async () => {
    if (!createdServer) return;

    setValidating(true);
    setValidateError(null);

    try {
      const validationResult = await serversService.verify(createdServer.id);
      if (!validationResult.isVerified) {
        throw new Error(
          validationResult.verificationError ||
            'Incomplete SSH validation: passwordless sudo must be validated.',
        );
      }
      await serversService.detect(createdServer.id);

      const updated = await serversService.getById(createdServer.id);
      setCreatedServer(updated);
      setStep('done');
    } catch (error) {
      setValidateError(getApiErrorMessage(error));
    } finally {
      setValidating(false);
    }
  };

  const requiresPasswordInstall = createdServer?.connectionMode === 'ssh';
  const publicKey = createdServer?.sshPublicKey?.trim() ?? '';
  const manualCommand = publicKey
    ? `echo '${shellEscape(publicKey)}' >> ~/.ssh/authorized_keys`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Add Server"
        description="4-step wizard: creation, SSH key, validation, ready."
        actions={
          <Link
            href="/admin/servers"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={15} /> Back to Servers
          </Link>
        }
      />

      {/* Step indicators */}
      <SectionCard contentClassName="p-4">
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
          {STEPS.map(({ key, label }) => {
            const isActive = step === key;
            const isDone = key === 'done' && step === 'done';
            return (
              <div
                key={key}
                className={`rounded-xl border px-3 py-2 font-semibold transition ${
                  isDone
                    ? 'border-green-500/40 bg-green-500/10 text-green-400'
                    : isActive
                      ? 'border-[var(--border)] bg-[var(--text-primary)]/10 text-[var(--text-secondary)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)]/3 text-[var(--text-secondary)]'
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Step 1: Form */}
      {step === 'form' && (
        <SectionCard title="Server information">
          <ServerForm onSubmit={handleCreate} loading={creating} error={createError} />
        </SectionCard>
      )}

      {/* Step 2: Install key */}
      {step === 'install' && createdServer && (
        <SectionCard title="SSH key installation" contentClassName="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Public key generated
            </p>
            <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/3 p-4">
              {publicKey ? (
                <>
                  <p className="break-all font-mono text-xs text-[var(--text-primary)]">{publicKey}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyPublicKey()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/5 px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
                  >
                    <Copy size={12} />
                    {copied ? 'Copied' : 'Copy key'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-red-400">Public key not found.</p>
              )}
            </div>
          </div>

          {requiresPasswordInstall && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                  Mot de passe temporaire VPS
                </label>
                <input
                  type="password"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  placeholder="Mot de passe SSH temporaire"
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border)] focus:bg-[var(--bg-card)]/8 focus:ring-2 focus:ring-zinc-500/20"
                />
              </div>
              {installError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {installError}
                </div>
              )}
              {installSuccess && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
                  {installSuccess}
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleInstallKey()}
                disabled={installing || !temporaryPassword.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60"
              >
                {installing ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Install the key on the VPS
              </button>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/3 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Installation manuelle
            </p>
            <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
              {manualCommand || 'Public key unavailable'}
            </p>
          </div>

          {!requiresPasswordInstall && (
            <button
              type="button"
              onClick={() => setStep('done')}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/5 px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-card)]/10"
            >
              Continuer
            </button>
          )}
        </SectionCard>
      )}

      {/* Step 3: Validate */}
      {step === 'validate' && createdServer && (
        <SectionCard title="Validation serveur" contentClassName="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/3 p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Checking…</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              SSH validation, sudo and server info detection.
            </p>
          </div>
          {validateError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {validateError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleValidateAndDetect()}
            disabled={validating}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60"
          >
            {validating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              'Validate SSH and detect'
            )}
          </button>
          <ul className="list-inside list-disc space-y-1 text-xs text-[var(--text-secondary)]">
            <li>Check the SSH connection</li>
            <li>Check passwordless sudo</li>
            <li>Detect OS, Docker, Runner and system capabilities</li>
            <li>Ansible stays on the control node and is not installed on the VPS</li>
          </ul>
        </SectionCard>
      )}

      {/* Step 4: Done */}
      {step === 'done' && createdServer && (
        <SectionCard
          title="Server ready ✅"
          className="border-green-500/20 bg-green-500/8"
          contentClassName="space-y-4"
        >
          <div className="space-y-2 text-sm text-green-300">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              Server: <strong>{createdServer.name}</strong>
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              Mode: <strong>{createdServer.connectionMode.toUpperCase()}</strong>
            </p>
            {createdServer.connectionMode === 'ssh' && (
              <>
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  SSH: {createdServer.isVerified ? <strong>✅</strong> : '⏳'}
                </p>
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  Docker: {createdServer.hasDocker ? <strong>✅</strong> : '⏳'}
                </p>
                <p className="inline-flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  Managed by Ansible from control node: <strong>✅</strong>
                </p>
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/admin/servers')}
              className="inline-flex items-center gap-2 rounded-xl bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:bg-green-500/15"
            >
              View servers
            </button>
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-500/15"
            >
              Go to your project to create an environment
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
