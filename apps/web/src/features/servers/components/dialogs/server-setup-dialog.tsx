"use client";

import { Check, Wrench, Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { useSetupReadiness } from "@/features/servers/api/use-servers";
import type {
  Server,
  StartServerSetupPayload,
} from "@/features/servers/types/server";

export type SetupDialogOptions = StartServerSetupPayload;

// Décision produit : "Setup Server" installe TOUT ce qui est nécessaire en un
// seul bouton, décidé entièrement côté backend (server-setup.ts) — aucun
// choix, aucune case à cocher. GitLab Runner et la stack d'observabilité
// complète (Prometheus/Grafana/Loki/Alertmanager/exporters) sont désormais
// systématiques, au même titre que Docker ou le firewall.
const SERVER_TOOLS: string[] = [
  "System base",
  "Docker Engine + Compose",
  "Docker TLS Connection",
  "Nixpacks",
  "Reverse Proxy (Traefik + HTTPS)",
  "GitLab Runner",
  "UFW firewall",
  "Fail2ban",
  "Swap",
  "System diagnostics tools",
  "Prometheus",
  "Grafana",
  "Loki",
  "Alertmanager",
  "Node Exporter",
  "cAdvisor",
  "Log rotation",
  "Security hardening",
];

type ServerSetupDialogProps = {
  open: boolean;
  server: Server | null;
  isBusy: boolean;
  settingUpId: string | null;
  // "Validate SSH" est repliée ici (le tableau serveurs n'a que 6 actions) :
  // proposée inline quand la validation SSH est le prérequis bloquant.
  onVerify?: (server: Server) => Promise<void>;
  verifyingId?: string | null;
  onClose: () => void;
  onStartSetup: (
    server: Server,
    options: StartServerSetupPayload,
  ) => Promise<void>;
};

export function ServerSetupDialog({
  open,
  server,
  isBusy,
  settingUpId,
  onVerify,
  verifyingId,
  onClose,
  onStartSetup,
}: ServerSetupDialogProps) {
  const readinessQuery = useSetupReadiness(
    open && server ? server.id : "",
  );

  if (!server) return null;

  const readiness = readinessQuery.data;
  const readinessLoading =
    readinessQuery.isLoading || readinessQuery.isFetching;
  const readinessError = readinessQuery.error
    ? "Unable to check provisioning prerequisites right now."
    : null;
  const blockingReasons = readinessLoading
    ? ["Checking setup prerequisites..."]
    : readinessError
      ? [readinessError]
      : (readiness?.blockingReasons ?? []);
  const isReady =
    !readinessLoading && !readinessError && Boolean(readiness?.isReady);
  const busyThis = settingUpId === server.id;

  const runSetup = () => {
    void onStartSetup(server, {});
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!isBusy}
      size="lg"
      title="Setup Server"
      description={`${server.username}@${server.host}:${server.port}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            onClick={runSetup}
            disabled={isBusy || !isReady}
            loading={busyThis}
            icon={busyThis ? undefined : <Wrench size={14} />}
          >
            Setup Server
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">
          Managed via SSH from the control node — the fixed set below is
          installed as-is, in full.
        </div>

        {/* Ce que Setup Server installe (lecture seule, aucun choix). */}
        <div className="rounded-lg border border-border bg-hover/10 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-secondary">
            Installs
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SERVER_TOOLS.map((label) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <Check
                  size={14}
                  className="shrink-0 text-green-400"
                  aria-hidden
                />
                <span className="font-semibold text-primary">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!isReady && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Setup blocked</p>
              {onVerify && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onVerify(server)}
                  loading={verifyingId === server.id}
                  icon={
                    verifyingId === server.id ? undefined : <Zap size={13} />
                  }
                >
                  Validate SSH
                </Button>
              )}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
