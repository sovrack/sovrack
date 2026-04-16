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
import type {
  CreateServerPayload,
  CreateServerResult,
} from '@/types/server';

type SetupStep = 'form' | 'install' | 'validate' | 'done';

function shellEscape(value: string): string {
  return value.replace(/'/g, `'\"'\"'`);
}

export default function NewServerPage() {
  const router = useRouter();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const [step, setStep] = useState<SetupStep>('form');
  const [createdServer, setCreatedServer] = useState<CreateServerResult | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [keyInstalled, setKeyInstalled] = useState(false);

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
    setKeyInstalled(false);

    try {
      const created = await serversService.create(payload);
      setCreatedServer(created);
      setStep(created.connectionMode === 'agent' ? 'done' : 'install');
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

  const handleKeyInstalled = async () => {
    if (!createdServer) return;
    
    const refreshed = await serversService.getById(createdServer.id);
    setCreatedServer(refreshed);
    
    if (createdServer.connectionMode === 'ssh') {
      setStep('validate');
    } else {
      setStep('done');
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

      setInstallSuccess(result.message);
      setKeyInstalled(true);
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
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
          >
            <ArrowLeft size={15} /> Back to Servers
          </Link>
        }
      />

      <SectionCard contentClassName="p-4">
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
          <div className={`rounded-xl border px-3 py-2 font-semibold ${step === 'form' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            1. Infos serveur
          </div>
          <div className={`rounded-xl border px-3 py-2 font-semibold ${step === 'install' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            2. Installation clé
          </div>
          <div className={`rounded-xl border px-3 py-2 font-semibold ${step === 'validate' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            3. Validation
          </div>
          <div className={`rounded-xl border px-3 py-2 font-semibold ${step === 'done' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
            4. Prêt ✅
          </div>
        </div>
      </SectionCard>

      {step === 'form' && (
        <SectionCard title="Server information">
          <ServerForm onSubmit={handleCreate} loading={creating} error={createError} />
        </SectionCard>
      )}

      {step === 'install' && createdServer && (
        <SectionCard title="SSH key installation" contentClassName="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Clé publique générée</p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {publicKey ? (
                <>
                  <p className="break-all font-mono text-xs text-slate-800">{publicKey}</p>
                  <button type="button" onClick={() => void handleCopyPublicKey()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
                    <Copy size={12} />
                    {copied ? 'Copié' : 'Copier la clé'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-red-600">Clé publique introuvable.</p>
              )}
            </div>
          </div>

          {requiresPasswordInstall && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Mot de passe temporaire VPS</label>
                <input type="password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder="Mot de passe SSH temporaire" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>
              {installError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{installError}</div>}
              {installSuccess && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{installSuccess}</div>}
              <button type="button" onClick={() => void handleInstallKey()} disabled={installing || !temporaryPassword.trim()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {installing ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Installer la clé sur le VPS
              </button>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Installation manuelle</p>
            <p className="mt-2 break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">{manualCommand || 'Clé publique indisponible'}</p>
          </div>

          {!requiresPasswordInstall && (
            <button type="button" onClick={() => setStep('done')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Continuer
            </button>
          )}
        </SectionCard>
      )}

      {step === 'validate' && createdServer && (
        <SectionCard title="Validation serveur" contentClassName="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Vérification en cours...</p>
            <p className="mt-2 text-xs text-slate-600">Vérification SSH, Docker, Ansible...</p>
          </div>
          {validateError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validateError}</div>}
          <button type="button" onClick={() => void handleVerifyAndInstall()} disabled={validating} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {validating ? <Loader2 size={15} className="animate-spin" /> : <>Vérifier et installer</>}
          </button>
          <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
            <li>Vérifier la connexion SSH</li>
            <li>Vérifier/installer Docker</li>
            <li>Vérifier/installer Ansible et GitLab Runner</li>
          </ul>
        </SectionCard>
      )}

      {step === 'done' && createdServer && (
        <SectionCard title="Serveur prêt ✅" className="border-emerald-200 bg-emerald-50" contentClassName="space-y-4">
          <div className="space-y-2 text-sm text-emerald-900">
            <p className="inline-flex items-center gap-2"><CheckCircle2 size={16} />Serveur: <strong>{createdServer.name}</strong></p>
            <p className="inline-flex items-center gap-2"><CheckCircle2 size={16} />Mode: <strong>{createdServer.connectionMode.toUpperCase()}</strong></p>
            {createdServer.connectionMode === 'ssh' && (
              <>
                <p className="inline-flex items-center gap-2"><CheckCircle2 size={16} />SSH: {createdServer.isVerified ? <strong>✅</strong> : '⏳'}</p>
                <p className="inline-flex items-center gap-2"><CheckCircle2 size={16} />Docker: {createdServer.hasDocker ? <strong>✅</strong> : '⏳'}</p>
                <p className="inline-flex items-center gap-2"><CheckCircle2 size={16} />Ansible: {createdServer.hasAnsible ? <strong>✅</strong> : '⏳'}</p>
              </>
            )}
          </div>
          {createdServer.connectionMode === 'agent' && (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-900">
              <p className="font-semibold text-emerald-700">Enrôlement agent</p>
              <div className="rounded bg-slate-900 p-2 font-mono text-xs text-slate-100">
                <p>SERVER_ID={createdServer.id}</p>
                <p>AGENT_TOKEN={createdServer.agentBootstrapToken?.substring(0, 12)}...</p>
                <p>API_URL={apiBaseUrl}</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => router.push('/admin/servers')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
              Voir serveurs
            </button>
            <button type="button" onClick={() => router.push('/admin/environments/new')} className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50">
              Créer environnement
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
