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
  { key: 'install', label: '2. Installation clé' },
  { key: 'validate', label: '3. Validation' },
  { key: 'done', label: '4. Prêt ✅' },
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

  const handleVerifyAndInstall = async () => {
    if (!createdServer) return;

    setValidating(true);
    setValidateError(null);

    try {
      await serversService.verify(createdServer.id);
      await serversService.installTools(createdServer.id, {
        docker: true,
        ansible: true,
        runner: true,
      });

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
        description="Wizard 4 étapes: création, clé SSH, validation, prêt."
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
              Clé publique générée
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
                    {copied ? 'Copié' : 'Copier la clé'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-red-400">Clé publique introuvable.</p>
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
                Installer la clé sur le VPS
              </button>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/3 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
              Installation manuelle
            </p>
            <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
              {manualCommand || 'Clé publique indisponible'}
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
            <p className="text-sm font-semibold text-[var(--text-primary)]">Vérification en cours...</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Vérification SSH, Docker, Ansible...
            </p>
          </div>
          {validateError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {validateError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleVerifyAndInstall()}
            disabled={validating}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-60"
          >
            {validating ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              'Vérifier et installer'
            )}
          </button>
          <ul className="list-inside list-disc space-y-1 text-xs text-[var(--text-secondary)]">
            <li>Vérifier la connexion SSH</li>
            <li>Vérifier/installer Docker</li>
            <li>Vérifier/installer Ansible et GitLab Runner</li>
          </ul>
        </SectionCard>
      )}

      {/* Step 4: Done */}
      {step === 'done' && createdServer && (
        <SectionCard
          title="Serveur prêt ✅"
          className="border-green-500/20 bg-green-500/8"
          contentClassName="space-y-4"
        >
          <div className="space-y-2 text-sm text-green-300">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              Serveur: <strong>{createdServer.name}</strong>
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
                  Ansible: {createdServer.hasAnsible ? <strong>✅</strong> : '⏳'}
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
              Voir serveurs
            </button>
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-500/15"
            >
              Allez dans votre projet pour créer un environnement
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
