'use client';

import { useState } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import type { CreateServerPayload } from '@/types/server';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim() || 'ubuntu',
      sshKey: sshKey.trim(),
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
        {/* Name */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            Server Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VPS Production"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
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
            placeholder="192.168.1.100"
            required
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Port */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            SSH Port
          </label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            min="1"
            max="65535"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* Username */}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
            SSH Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ubuntu"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* SSH Key */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
              SSH Private Key <span className="text-red-400">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-600"
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <textarea
            value={sshKey}
            onChange={(e) => setSshKey(e.target.value)}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
            required
            rows={showKey ? 8 : 3}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            style={{ filter: showKey ? 'none' : 'blur(3px)' }}
          />
          <p className="mt-1 text-xs text-slate-400">
            The private key is stored securely and never displayed again.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !name.trim() || !host.trim() || !sshKey.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        Add Server
      </button>
    </form>
  );
}
