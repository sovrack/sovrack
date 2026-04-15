'use client';

import { useState } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import type { CreateServerPayload } from '@/types/server';

// Schéma Zod de validation du formulaire serveur
const hostSchema = z
  .string()
  .min(1, 'Le host est obligatoire')
  .refine(
    (v) => {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipv4.test(v)) {
        return v.split('.').every((n) => parseInt(n, 10) <= 255);
      }
      const hostname =
        /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      return hostname.test(v);
    },
    { message: 'Host invalide — saisir une IP ou un hostname valide' },
  );

const serverFormSchema = z.object({
  name: z.string().min(1, 'Le nom du serveur est obligatoire'),
  host: hostSchema,
  port: z
    .number()
    .int()
    .min(1, 'Port minimum : 1')
    .max(65535, 'Port maximum : 65535'),
  username: z.string().min(1, 'Le username SSH est obligatoire'),
});

type FormErrors = Partial<Record<'name' | 'host' | 'port' | 'username' | 'sshKey', string>>;

type ServerFormProps = {
  onSubmit: (payload: CreateServerPayload) => Promise<void>;
  loading?: boolean;
  error?: string | null;
};

export function ServerForm({ onSubmit, loading = false, error }: ServerFormProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('ubuntu');
  const [sshKey, setSshKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connectionMode, setConnectionMode] = useState<'ssh' | 'bastion' | 'agent'>(
    'ssh',
  );
  const [bastionHost, setBastionHost] = useState('');
  const [bastionPort, setBastionPort] = useState('22');
  const [bastionUsername, setBastionUsername] = useState('ubuntu');
  const [bastionSshKey, setBastionSshKey] = useState('');
  const [verificationMode, setVerificationMode] = useState<'manual' | 'ssh'>(
    'manual',
  );

  // Erreurs de validation Zod par champ
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    // Validation Zod des champs principaux
    const validation = serverFormSchema.safeParse({
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim() || 'ubuntu',
    });

    if (!validation.success) {
      const errors: FormErrors = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as keyof FormErrors;
        errors[field] = issue.message;
      }
      setFormErrors(errors);
      return;
    }

    // Validation de la clé SSH pour les modes non-agent
    const sshKeyValue = sshKey.trim();
    if (connectionMode !== 'agent' && sshKeyValue && !sshKeyValue.startsWith('-----BEGIN')) {
      setFormErrors({ sshKey: 'La clé SSH doit commencer par "-----BEGIN"' });
      return;
    }

    await onSubmit({
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim() || 'ubuntu',
      ...(sshKeyValue && { sshKey: sshKeyValue }),
      verificationMode,
      connectionMode,
      ...(connectionMode === 'bastion' && {
        bastionHost: bastionHost.trim(),
        bastionPort: Number(bastionPort) || 22,
        bastionUsername: bastionUsername.trim() || 'ubuntu',
        bastionSshKey: bastionSshKey.trim(),
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Connection mode */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Connection Mode
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="radio"
                name="connectionMode"
                checked={connectionMode === 'ssh'}
                onChange={() => setConnectionMode('ssh')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  SSH
                </span>
                <span className="block text-xs text-slate-500">
                  Direct access to the VPS.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="radio"
                name="connectionMode"
                checked={connectionMode === 'bastion'}
                onChange={() => setConnectionMode('bastion')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Bastion
                </span>
                <span className="block text-xs text-slate-500">
                  Reach private VPS through jump host.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="radio"
                name="connectionMode"
                checked={connectionMode === 'agent'}
                onChange={() => setConnectionMode('agent')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Agent
                </span>
                <span className="block text-xs text-slate-500">
                  Queue jobs for pull-based execution.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Verification mode */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Verification Mode
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="radio"
                name="verificationMode"
                checked={verificationMode === 'manual'}
                onChange={() => setVerificationMode('manual')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Créer seulement
                </span>
                <span className="block text-xs text-slate-500">
                  Vous confirmez SSH/outils plus tard depuis la liste.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <input
                type="radio"
                name="verificationMode"
                checked={verificationMode === 'ssh'}
                onChange={() => setVerificationMode('ssh')}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Créer et vérifier SSH
                </span>
                <span className="block text-xs text-slate-500">
                  Lance les vérifications SSH/outils automatiquement après création.
                </span>
              </span>
            </label>
          </div>
        </div>

        {connectionMode === 'bastion' && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Bastion Host <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={bastionHost}
                onChange={(e) => setBastionHost(e.target.value)}
                placeholder="10.0.0.10"
                required={connectionMode === 'bastion'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Bastion Port
              </label>
              <input
                type="number"
                value={bastionPort}
                onChange={(e) => setBastionPort(e.target.value)}
                min="1"
                max="65535"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Bastion Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={bastionUsername}
                onChange={(e) => setBastionUsername(e.target.value)}
                placeholder="ubuntu"
                required={connectionMode === 'bastion'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                Bastion SSH Private Key <span className="text-red-400">*</span>
              </label>
              <textarea
                value={bastionSshKey}
                onChange={(e) => setBastionSshKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                required={connectionMode === 'bastion'}
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </>
        )}

        {/* Name */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Nom du serveur <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VPS Production OVH"
            className={`w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 ${
              formErrors.name
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
            }`}
          />
          {formErrors.name && (
            <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
          )}
        </div>

        {/* Host */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Host / IP <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.122.30 ou vps-xxx.ovh.net"
            className={`w-full rounded-xl border bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 ${
              formErrors.host
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
            }`}
          />
          {formErrors.host && (
            <p className="mt-1 text-xs text-red-600">{formErrors.host}</p>
          )}
        </div>

        {/* Port */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Port SSH
          </label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            min="1"
            max="65535"
            className={`w-full rounded-xl border bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 ${
              formErrors.port
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
            }`}
          />
          {formErrors.port && (
            <p className="mt-1 text-xs text-red-600">{formErrors.port}</p>
          )}
        </div>

        {/* Username */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Username SSH
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ubuntu"
            className={`w-full rounded-xl border bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 ${
              formErrors.username
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
            }`}
          />
          {formErrors.username && (
            <p className="mt-1 text-xs text-red-600">{formErrors.username}</p>
          )}
        </div>

        {/* SSH Key */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              Clé SSH privée{' '}
              {connectionMode !== 'agent' && <span className="text-red-400">*</span>}
            </label>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-600"
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              {showKey ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          <textarea
            value={sshKey}
            onChange={(e) => setSshKey(e.target.value)}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
            rows={showKey ? 8 : 3}
            className={`w-full resize-none rounded-xl border bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:bg-white focus:ring-2 ${
              formErrors.sshKey
                ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-100'
            }`}
            style={{ filter: showKey ? 'none' : 'blur(3px)' }}
          />
          {formErrors.sshKey ? (
            <p className="mt-1 text-xs text-red-600">{formErrors.sshKey}</p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              Optionnel: laissez vide pour générer automatiquement une paire SSH.
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={
          loading ||
          !name.trim() ||
          !host.trim() ||
          (connectionMode === 'bastion' &&
            (!bastionHost.trim() || !bastionUsername.trim() || !bastionSshKey.trim()))
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {verificationMode === 'ssh' ? 'Créer et vérifier SSH' : 'Créer le serveur'}
      </button>
    </form>
  );
}
