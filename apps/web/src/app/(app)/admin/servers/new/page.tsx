'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2, Server } from 'lucide-react';
import { ServerForm } from '@/components/servers/server-form';
import { getApiErrorMessage } from '@/lib/api';
import { serversService } from '@/services/servers.service';
import type { CreateServerPayload, Server as ServerType } from '@/types/server';

type SetupStep = 'form' | 'install' | 'done';

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

export default function NewServerPage() {
  const router = useRouter();

  const [step, setStep] = useState<SetupStep>('form');
  const [createdServer, setCreatedServer] = useState<ServerType | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [keyInstalled, setKeyInstalled] = useState(false);

  const [copied, setCopied] = useState(false);

  const handleCreate = async (payload: CreateServerPayload) => {
    setCreating(true);
    setCreateError(null);
    setInstallError(null);
    setInstallSuccess(null);
    setCopied(false);
    setTemporaryPassword('');
    setKeyInstalled(false);

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
    if (!createdServer?.sshPublicKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdServer.sshPublicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleInstallKey = async () => {
    if (!createdServer) {
      return;
    }

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

      const refreshed = await serversService.getById(createdServer.id);
      setCreatedServer(refreshed);
      setKeyInstalled(true);
      setInstallSuccess(result.message);
      setStep('done');
    } catch (error) {
      setInstallError(getApiErrorMessage(error));
    } finally {
      setInstalling(false);
    }
  };

  const requiresPasswordInstall = createdServer?.connectionMode === 'ssh';
  const publicKey = createdServer?.sshPublicKey?.trim() ?? '';
  const manualCommand = publicKey
    ? `echo '${shellEscape(publicKey)}' >> ~/.ssh/authorized_keys`
    : '';

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/servers"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} /> Back to Servers
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <Server size={20} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Add Server</h1>
            <p className="text-sm text-slate-500">
              Assistant en 3 étapes: création, installation de clé, validation.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div
            className={`rounded-xl border px-3 py-2 font-semibold ${
              step === 'form'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            1. Infos serveur
          </div>
          <div
            className={`rounded-xl border px-3 py-2 font-semibold ${
              step === 'install'
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            2. Installation de clé SSH
          </div>
          <div
            className={`rounded-xl border px-3 py-2 font-semibold ${
              step === 'done'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            3. Résultat
          </div>
        </div>
      </div>

      {step === 'form' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <ServerForm
            onSubmit={handleCreate}
            loading={creating}
            error={createError}
          />
        </div>
      )}

      {step === 'install' && createdServer && (
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Clé publique générée
            </p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {publicKey ? (
                <>
                  <p className="break-all font-mono text-xs text-slate-800">
                    {publicKey}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyPublicKey()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <Copy size={12} />
                    {copied ? 'Copié' : 'Copier la clé'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-red-600">
                  Clé publique introuvable sur ce serveur.
                </p>
              )}
            </div>
          </div>

          {requiresPasswordInstall ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Mot de passe temporaire VPS
                </label>
                <input
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  placeholder="Mot de passe SSH temporaire"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {installError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {installError}
                </div>
              )}

              {installSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {installSuccess}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleInstallKey()}
                disabled={installing || !temporaryPassword.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {installing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <KeyRound size={15} />
                )}
                Installer la clé sur le VPS
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              L’installation automatique par mot de passe est disponible
              uniquement en mode SSH direct.
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Ou copiez manuellement sur votre VPS
            </p>
            <p className="mt-2 break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
              {manualCommand || 'Clé publique indisponible'}
            </p>
          </div>

          {!requiresPasswordInstall && (
            <button
              type="button"
              onClick={() => setStep('done')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Continuer
            </button>
          )}
        </div>
      )}

      {step === 'done' && createdServer && (
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-lg font-semibold text-emerald-900">
            Configuration serveur terminée
          </h2>

          <div className="space-y-2 text-sm text-emerald-900">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              Serveur créé: <strong>{createdServer.name}</strong>
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              Clé publique générée automatiquement
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              {keyInstalled
                ? 'Clé installée sur le VPS'
                : 'Installation de clé à finaliser manuellement'}
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} />
              {createdServer.isVerified
                ? 'Connexion SSH vérifiée'
                : 'Connexion SSH à vérifier depuis la liste des serveurs'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/admin/servers')}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Continuer
          </button>
        </div>
      )}
    </div>
  );
}
