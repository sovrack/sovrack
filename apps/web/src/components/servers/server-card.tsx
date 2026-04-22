import { CheckCircle, Server, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  ServerOverallStatusBadge,
  ServerStatusBadges,
} from '@/components/servers/server-status-badges';
import { ServerActions } from '@/components/servers/server-actions';
import type { Server as ServerType } from '@/types/server';

type ServerCardProps = {
  server: ServerType;
  isBusy: boolean;
  verifyingId: string | null;
  installingKeyId: string | null;
  deletingId: string | null;
  registeringId: string | null;
  updatingId: string | null;
  formatConnectionMode: (mode: ServerType['connectionMode']) => string;
  onVerify: (id: string) => Promise<void>;
  onInstallKey: (server: ServerType) => void;
  onOpenPrepare: (server: ServerType) => void;
  onOpenDetails: (server: ServerType) => void;
  onOpenRunner: (serverId: string) => void;
  onEdit: (server: ServerType) => void;
  onDelete: (server: ServerType) => void;
};

function getOnboardingStepBadge(step: ServerType['onboardingStep']) {
  if (step === 'PENDING') {
    return { tone: 'error' as const, label: 'Pending' };
  }
  if (step === 'KEY_INSTALLED') {
    return { tone: 'warning' as const, label: 'Key installed' };
  }
  if (step === 'VALIDATED') {
    return { tone: 'info' as const, label: 'Validated' };
  }
  if (step === 'READY') {
    return { tone: 'success' as const, label: 'Ready' };
  }
  return { tone: 'default' as const, label: step };
}

export function ServerCard({
  server,
  isBusy,
  verifyingId,
  installingKeyId,
  deletingId,
  registeringId,
  updatingId,
  formatConnectionMode,
  onVerify,
  onInstallKey,
  onOpenPrepare,
  onOpenDetails,
  onOpenRunner,
  onEdit,
  onDelete,
}: ServerCardProps) {
  const onboarding = getOnboardingStepBadge(server.onboardingStep);
  const needsSshKeyInstall =
    server.connectionMode === 'ssh' &&
    server.onboardingStep === 'PENDING' &&
    !server.isVerified;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border)]/70">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr),minmax(0,1fr),minmax(0,1fr),auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                server.isVerified
                  ? 'bg-green-500/10'
                  : 'bg-[var(--hover)]'
              }`}
            >
              <Server
                size={18}
                className={server.isVerified ? 'text-green-400' : 'text-[var(--text-secondary)]'}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{server.name}</h3>
                {server.isVerified ? (
                  <Badge tone="success" size="sm">
                    <CheckCircle size={10} /> Verified
                  </Badge>
                ) : (
                  <Badge tone="default" size="sm">
                    <XCircle size={10} /> Unverified
                  </Badge>
                )}
                <Badge tone={onboarding.tone} size="sm">
                  {onboarding.label}
                </Badge>
              </div>

              <p className="mt-1 break-all font-mono text-xs text-[var(--text-secondary)]">
                {server.username}@{server.host}:{server.port}
              </p>
              {needsSshKeyInstall && (
                <p className="mt-1 text-[11px] text-yellow-500">
                  SSH key installation required before verification.
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
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            Tools & Status
          </p>
          <div className="mt-1.5 space-y-2">
            <ServerOverallStatusBadge
              isActive={server.isActive}
              isVerified={server.isVerified}
              hasDocker={server.hasDocker}
              hasAnsible={server.hasAnsible}
              hasRunner={server.hasRunner}
            />
            <ServerStatusBadges
              isVerified={server.isVerified}
              hasDocker={server.hasDocker}
              hasAnsible={server.hasAnsible}
              hasRunner={server.hasRunner}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <ServerActions
            server={server}
            isBusy={isBusy}
            verifyingId={verifyingId}
            installingKeyId={installingKeyId}
            registeringId={registeringId}
            deletingId={deletingId}
            updatingId={updatingId}
            onVerify={onVerify}
            onInstallKey={onInstallKey}
            onOpenPrepare={onOpenPrepare}
            onOpenDetails={onOpenDetails}
            onOpenRunner={onOpenRunner}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
