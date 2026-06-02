'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Radar, Wrench, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import {
  formatPreparationBlockingReason,
  ServerOverallStatusBadge,
  ServerWorkflowBadges,
} from '@/components/servers/server-status-badges';
import { ServerValidationCard } from '@/components/servers/server-validation-card';
import { ServerCapabilitiesCard } from '@/components/servers/server-capabilities-card';
import { InstalledToolsList } from '@/components/servers/installed-tools-list';
import { ServerPreparationHistory } from '@/components/servers/server-preparation-history';
import { ServerPreparationLogViewer } from '@/components/servers/server-preparation-log-viewer';
import { ServerPrepareDialog, type PrepareOptions } from '@/components/servers/server-prepare-dialog';
import { ServerAuditTimeline } from '@/components/servers/server-audit-timeline';
import {
  useCancelPreparation,
  useDetectServerInfo,
  useInstalledTools,
  usePreparationReadiness,
  useRetryPreparation,
  useServer,
  useServerAuditEvents,
  useServerCapabilities,
  useServerPreparations,
  useServerValidationResults,
  useStartServerPreparation,
  useValidateServerSsh,
} from '@/hooks/servers/use-servers';
import type { Server, ServerPreparation } from '@/types/server';

export default function AdminServerDetailPage() {
  const params = useParams();
  const serverId = params.id as string;
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepareOptions, setPrepareOptions] = useState<PrepareOptions>({
    gitlabRunnerExecutor: 'docker',
  });
  const [selectedPreparation, setSelectedPreparation] = useState<ServerPreparation | null>(null);

  const serverQuery = useServer(serverId);
  const validationsQuery = useServerValidationResults(serverId);
  const capabilitiesQuery = useServerCapabilities(serverId);
  const toolsQuery = useInstalledTools(serverId);
  const preparationsQuery = useServerPreparations(serverId);
  const readinessQuery = usePreparationReadiness(serverId);
  const auditEventsQuery = useServerAuditEvents(serverId);
  const validateMutation = useValidateServerSsh(serverId);
  const detectMutation = useDetectServerInfo(serverId);
  const startPreparation = useStartServerPreparation(serverId);
  const retryPreparation = useRetryPreparation();
  const cancelPreparation = useCancelPreparation();

  const server = serverQuery.data;
  const readiness = readinessQuery.data;
  const loading = serverQuery.isLoading;

  const onFieldChange = (
    _server: Server,
    field: keyof PrepareOptions,
    value: boolean | string | string[],
  ) => {
    setPrepareOptions((prev) => ({
      ...prev,
      [field]: value as PrepareOptions[keyof PrepareOptions],
    }));
  };

  const onPrepare = async () => {
    await startPreparation.mutateAsync(prepareOptions);
    setPrepareOpen(false);
  };

  const primaryAction: 'validate' | 'detect' | 'prepare' =
    !server || !server.isVerified || server.status === 'VALIDATION_FAILED'
      ? 'validate'
      : !server.lastDetectedAt && server.status !== 'INFO_DETECTED'
        ? 'detect'
        : 'prepare';

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="space-y-4">
        <Link href="/admin/servers">
          <Button variant="secondary" icon={<ArrowLeft size={16} />}>Back</Button>
        </Link>
        <SectionCard title="Server not found">
          <p className="text-sm text-[var(--text-secondary)]">
            This server may have been deleted or you may not have access.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Remote server"
        title={server.name}
        description={`${server.username}@${server.host}:${server.port}`}
        actions={
          <>
            <Link href="/admin/servers">
              <Button variant="secondary" icon={<ArrowLeft size={16} />}>Back</Button>
            </Link>

            {/* Secondary: Re-validate (only when primary is not validate) */}
            {primaryAction !== 'validate' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Zap size={14} />}
                loading={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                Re-validate SSH
              </Button>
            )}

            {/* Primary action — ONE clear button based on server state */}
            {primaryAction === 'validate' && (
              <Button
                icon={<Zap size={15} />}
                loading={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                Validate SSH
              </Button>
            )}
            {primaryAction === 'detect' && (
              <Button
                icon={<Radar size={15} />}
                loading={detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
                disabled={!server.isVerified}
              >
                Detect Info
              </Button>
            )}
            {primaryAction === 'prepare' && (
              <Button
                icon={<Wrench size={15} />}
                onClick={() => setPrepareOpen(true)}
                disabled={
                  !server.isVerified ||
                  startPreparation.isPending ||
                  Boolean(readiness && !readiness.isReady)
                }
                loading={startPreparation.isPending}
              >
                {server.status === 'PREPARATION_FAILED'
                  ? 'Retry Preparation'
                  : server.status === 'PREPARED' || server.status === 'PARTIALLY_PREPARED'
                    ? 'Re-prepare'
                    : 'Prepare Server'}
              </Button>
            )}
          </>
        }
      />

      <SectionCard contentClassName="space-y-3">
        <ServerOverallStatusBadge server={server} />
        <ServerWorkflowBadges server={server} />
        <p className="text-sm text-[var(--text-secondary)]">
          Ansible remains installed and executed on the backend/control node. The VPS is only an SSH target, which centralizes security, maintenance, logs and audit.
        </p>
        {readiness && !readiness.isReady && readiness.blockingReasons.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <p className="mb-1 font-semibold">Preparation blocked:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              {readiness.blockingReasons.map((reason, i) => (
                <li key={i}>{formatPreparationBlockingReason(reason)}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ServerValidationCard results={validationsQuery.data ?? []} />
        <InstalledToolsList tools={toolsQuery.data ?? []} />
        <ServerCapabilitiesCard capabilities={capabilitiesQuery.data ?? []} />
        <ServerPreparationHistory
          preparations={preparationsQuery.data ?? []}
          onOpenLogs={setSelectedPreparation}
          retryingId={retryPreparation.isPending ? retryPreparation.variables?.id : null}
          cancelingId={
            cancelPreparation.isPending ? cancelPreparation.variables ?? null : null
          }
          onRetry={(preparation) => {
            retryPreparation.mutate({ id: preparation.id, reason: 'Retry from server detail page' });
          }}
          onCancel={(preparation) => {
            cancelPreparation.mutate(preparation.id);
          }}
        />
        <ServerAuditTimeline events={auditEventsQuery.data ?? []} />
      </div>

      <ServerPrepareDialog
        open={prepareOpen}
        server={server}
        prepareOptions={prepareOptions}
        isBusy={startPreparation.isPending}
        preparingId={startPreparation.isPending ? server.id : null}
        installedTools={toolsQuery.data ?? []}
        onClose={() => setPrepareOpen(false)}
        onFieldChange={onFieldChange}
        onPrepare={() => onPrepare()}
      />

      <ServerPreparationLogViewer
        preparation={selectedPreparation}
        onClose={() => setSelectedPreparation(null)}
      />
    </div>
  );
}
