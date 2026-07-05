"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Radar, Wrench, Zap } from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Button } from "@/shared/ui/button";
import {
  formatPreparationBlockingReason,
  ServerOverallStatusBadge,
  ServerWorkflowBadges,
} from "@/features/servers/components/shared/server-status-badges";
import { ServerValidationCard } from "@/features/servers/components/cards/server-validation-card";
import { ServerCapabilitiesCard } from "@/features/servers/components/cards/server-capabilities-card";
import { InstalledToolsList } from "@/features/servers/components/panels/installed-tools-list";
import { ServerPreparationHistory } from "@/features/servers/components/panels/server-preparation-history";
import { ServerPreparationLogViewer } from "@/features/servers/components/panels/server-preparation-log-viewer";
import {
  ServerPrepareDialog,
  type PrepareOptions,
} from "@/features/servers/components/dialogs/server-prepare-dialog";
import { ServerAuditTimeline } from "@/features/servers/components/panels/server-audit-timeline";
import {
  useCancelPreparation,
  useDetectServerInfo,
  useDockerConnection,
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
} from "@/features/servers/api/use-servers";
import type { ServerPreparation } from "@/features/servers/types/server";

export default function AdminServerDetailPage() {
  const params = useParams();
  const serverId = params.id as string;
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [selectedPreparation, setSelectedPreparation] =
    useState<ServerPreparation | null>(null);

  const serverQuery = useServer(serverId);
  const validationsQuery = useServerValidationResults(serverId);
  const capabilitiesQuery = useServerCapabilities(serverId);
  const toolsQuery = useInstalledTools(serverId);
  const preparationsQuery = useServerPreparations(serverId);
  const readinessQuery = usePreparationReadiness(serverId);
  const auditEventsQuery = useServerAuditEvents(serverId);
  const dockerConnectionQuery = useDockerConnection(serverId);
  const validateMutation = useValidateServerSsh(serverId);
  const detectMutation = useDetectServerInfo(serverId);
  const startPreparation = useStartServerPreparation(serverId);
  const retryPreparation = useRetryPreparation();
  const cancelPreparation = useCancelPreparation();

  const server = serverQuery.data;
  const readiness = readinessQuery.data;
  const loading = serverQuery.isLoading;

  const onPrepare = async (options: PrepareOptions) => {
    await startPreparation.mutateAsync(options);
    setPrepareOpen(false);
  };

  const primaryAction: "validate" | "detect" | "prepare" =
    !server || !server.isVerified || server.status === "VALIDATION_FAILED"
      ? "validate"
      : !server.lastDetectedAt && server.status !== "INFO_DETECTED"
        ? "detect"
        : "prepare";

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
          <Button variant="secondary" icon={<ArrowLeft size={16} />}>
            Back
          </Button>
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
              <Button variant="secondary" icon={<ArrowLeft size={16} />}>
                Back
              </Button>
            </Link>

            {/* Secondary: Re-validate (only when primary is not validate) */}
            {primaryAction !== "validate" && (
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
            {primaryAction === "validate" && (
              <Button
                icon={<Zap size={15} />}
                loading={validateMutation.isPending}
                onClick={() => validateMutation.mutate()}
              >
                Validate SSH
              </Button>
            )}
            {primaryAction === "detect" && (
              <Button
                icon={<Radar size={15} />}
                loading={detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
                disabled={!server.isVerified}
              >
                Detect Info
              </Button>
            )}
            {primaryAction === "prepare" && (
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
                {server.status === "PREPARATION_FAILED"
                  ? "Retry Setup"
                  : server.status === "PREPARED" ||
                      server.status === "PARTIALLY_PREPARED"
                    ? "Re-run Setup"
                    : "Setup Server"}
              </Button>
            )}
          </>
        }
      />

      <SectionCard contentClassName="space-y-3">
        <ServerOverallStatusBadge server={server} />
        <ServerWorkflowBadges server={server} />
        {/* Mission docker_tls (T3): the platform's ability to DEPLOY on this
            server (registered mTLS DockerConnection) is a distinct signal from
            "Docker installed" — registered automatically by the "Docker TLS
            Connection" Setup Server option, or manually via the API. */}
        {dockerConnectionQuery.data ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400">
            Docker connection: Connected
            <span className="font-normal text-green-400/80">
              {dockerConnectionQuery.data.endpoint}
              {dockerConnectionQuery.data.apiVersion
                ? ` · API v${dockerConnectionQuery.data.apiVersion}`
                : ""}
              {dockerConnectionQuery.data.isReachable ? "" : " · unreachable"}
            </span>
          </div>
        ) : dockerConnectionQuery.isLoading ? null : (
          <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600">
            Docker connection: Not configured
            <span className="font-normal">
              — run Setup Server with “Docker TLS Connection” checked (required
              for deployments)
            </span>
          </div>
        )}
        <p className="text-sm text-[var(--text-secondary)]">
          Ansible remains installed and executed on the backend/control node.
          The VPS is only an SSH target, which centralizes security,
          maintenance, logs and audit.
        </p>
        {readiness &&
          !readiness.isReady &&
          readiness.blockingReasons.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <p className="mb-1 font-semibold">Setup blocked:</p>
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
          retryingId={
            retryPreparation.isPending ? retryPreparation.variables?.id : null
          }
          cancelingId={
            cancelPreparation.isPending
              ? (cancelPreparation.variables ?? null)
              : null
          }
          onRetry={(preparation) => {
            retryPreparation.mutate({
              id: preparation.id,
              reason: "Retry from server detail page",
            });
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
        isBusy={startPreparation.isPending}
        preparingId={startPreparation.isPending ? server.id : null}
        onClose={() => setPrepareOpen(false)}
        onPrepare={(_s, options) => onPrepare(options)}
      />

      <ServerPreparationLogViewer
        preparation={selectedPreparation}
        onClose={() => setSelectedPreparation(null)}
      />
    </div>
  );
}
