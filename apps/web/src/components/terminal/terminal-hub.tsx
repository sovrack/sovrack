'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Server,
  Terminal,
} from 'lucide-react';
import { useAuth } from '@/hooks/auth/use-auth';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import type { Server as RemoteServer } from '@/types/server';

// xterm.js must be rendered client-side only
const SshTerminal = dynamic(
  () => import('./ssh-terminal').then((m) => m.SshTerminal),
  { ssr: false },
);

export function TerminalHub() {
  const { isAdmin } = useAuth();
  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const all = await serversService.getAll();
      setServers(all);
      const first = all.find((s) => s.isVerified) ?? all[0];
      if (first) setSelectedServerId(first.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = () => {
    setActiveServerId(selectedServerId);
  };

  const handleClose = () => {
    setActiveServerId(null);
  };

  const selected = servers.find((s) => s.id === selectedServerId);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operations"
          title="Terminal SSH"
          description="Accès réservé aux administrateurs."
        />
        <SectionCard>
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <AlertCircle size={16} className="text-yellow-400" />
            Le terminal SSH est réservé aux administrateurs de la plateforme.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Terminal SSH"
        description="Connectez-vous à un VPS et exécutez des commandes en temps réel via SSH."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void load()}
            disabled={loading || !!activeServerId}
          >
            Rafraîchir
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Server selector (visible only when no active session) */}
      {!activeServerId && (
        <SectionCard
          title="Connexion SSH"
          description="Sélectionnez un VPS validé et ouvrez une session interactive."
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-[var(--text-secondary)]" />
            </div>
          ) : servers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
              <Server className="mx-auto mb-2 h-8 w-8 text-[var(--text-secondary)]" />
              <p className="text-sm text-[var(--text-secondary)]">Aucun VPS configuré.</p>
              <Link
                href="/admin/servers"
                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
              >
                <Server size={14} /> Configurer des VPS
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
                  VPS cible
                </label>
                <select
                  value={selectedServerId}
                  onChange={(e) => setSelectedServerId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.isVerified}>
                      {s.name} ({s.username}@{s.host}:{s.port})
                      {!s.isVerified ? ' — non vérifié' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs text-[var(--text-secondary)]">
                    <span>Host: <span className="text-[var(--text-primary)]">{selected.host}</span></span>
                    <span>Port: <span className="text-[var(--text-primary)]">{selected.port}</span></span>
                    <span>User: <span className="text-[var(--text-primary)]">{selected.username}</span></span>
                    <span>Statut: <span className={selected.isVerified ? 'text-green-400' : 'text-yellow-400'}>{selected.isVerified ? 'Vérifié' : 'Non vérifié'}</span></span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={!selectedServerId || !selected?.isVerified}
                icon={<Terminal size={14} />}
              >
                Ouvrir session SSH
              </Button>

              {selected && !selected.isVerified && (
                <p className="text-xs text-yellow-400">
                  Ce serveur n&apos;est pas encore validé. Validez-le d&apos;abord dans{' '}
                  <Link href="/admin/servers" className="underline">Servers</Link>.
                </p>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Active terminal */}
      {activeServerId && (
        <div className="flex-1 overflow-hidden">
          <SshTerminal serverId={activeServerId} onClose={handleClose} />
        </div>
      )}
    </div>
  );
}
