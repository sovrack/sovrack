import { CheckCircle, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ServerOverallStatusBadge,
  ServerStatusBadge,
  ServerWorkflowBadges,
} from '@/components/servers/server-status-badges';
import { ServerActions } from '@/components/servers/server-actions';
import type { Server as ServerType } from '@/types/server';

type ServerCardProps = {
  server: ServerType;
  isBusy: boolean;
  verifyingId: string | null;
  detectingId: string | null;
  preparingId: string | null;
  installingKeyId: string | null;
  deletingId: string | null;
  updatingId: string | null;
  formatConnectionMode: (mode: ServerType['connectionMode']) => string;
  onVerify: (id: string) => Promise<void>;
  onDetect: (id: string) => Promise<void>;
  onInstallKey: (server: ServerType) => void;
  onOpenPrepare: (server: ServerType) => void;
  onOpenDetails: (server: ServerType) => void;
  onEdit: (server: ServerType) => void;
  onDelete: (server: ServerType) => void;
};

export function ServerCard({
  server,
  isBusy,
  verifyingId,
  detectingId,
  preparingId,
  installingKeyId,
  deletingId,
  updatingId,
  formatConnectionMode,
  onVerify,
  onDetect,
  onInstallKey,
  onOpenPrepare,
  onOpenDetails,
  onEdit,
  onDelete,
}: ServerCardProps) {
  const needsSshKeyInstall =
    server.connectionMode === 'ssh' &&
    server.onboardingStep === 'PENDING' &&
    !server.isVerified;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border)]/70">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr),minmax(0,0.9fr),minmax(0,1.25fr),auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--hover)]">
              <Server size={18} className="text-[var(--text-secondary)]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {server.name}
                </h3>
                {server.isVerified && (
                  <Badge tone="success" size="sm">
                    <CheckCircle size={10} /> SSH validated
                  </Badge>
                )}
                <ServerStatusBadge status={server.status} />
              </div>

              <p className="mt-1 break-all font-mono text-xs text-[var(--text-secondary)]">
                {server.username}@{server.host}:{server.port}
              </p>
              {needsSshKeyInstall && (
                <p className="mt-1 text-[11px] text-yellow-500">
                  SSH key installation required before validation.
                </p>
              )}
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                Added on{' '}
                {new Date(server.createdAt).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Connection
          </p>
          <div className="mt-1.5 space-y-1.5">
            <Badge tone="brand" size="sm">
              {formatConnectionMode(server.connectionMode)}
            </Badge>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Agentless SSH target
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Readiness
          </p>
          <div className="mt-1.5 space-y-2">
            <ServerOverallStatusBadge server={server} />
            <ServerWorkflowBadges server={server} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <ServerActions
            server={server}
            isBusy={isBusy}
            verifyingId={verifyingId}
            detectingId={detectingId}
            preparingId={preparingId}
            installingKeyId={installingKeyId}
            deletingId={deletingId}
            updatingId={updatingId}
            onVerify={onVerify}
            onDetect={onDetect}
            onInstallKey={onInstallKey}
            onOpenPrepare={onOpenPrepare}
            onOpenDetails={onOpenDetails}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
