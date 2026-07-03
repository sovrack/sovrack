import { Server } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import {
  getServerOverallStatus,
  ServerToolBadges,
} from "@/features/servers/components/shared/server-status-badges";
import { ServerActions } from "@/features/servers/components/shared/server-actions";
import type { Server as ServerType } from "@/features/servers/types/server";

type ServerCardProps = {
  server: ServerType;
  // A3: live TCP reachability, refreshed automatically (~45s) while this
  // page stays open. `undefined` = not checked yet. Deliberately a separate
  // signal from isVerified/status (the last on-demand SSH validation
  // result, only updated when the user explicitly re-validates) — the two
  // coexist without either overwriting the other.
  isReachable?: boolean;
  isBusy: boolean;
  verifyingId: string | null;
  detectingId: string | null;
  preparingId: string | null;
  installingKeyId: string | null;
  deletingId: string | null;
  updatingId: string | null;
  formatConnectionMode: (mode: ServerType["connectionMode"]) => string;
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
  isReachable,
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
    server.connectionMode === "ssh" &&
    server.onboardingStep === "PENDING" &&
    !server.isVerified;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--border)]/70">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr),minmax(0,1fr),auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--hover)]">
              <Server size={18} className="text-[var(--text-secondary)]" />
              <span
                title={
                  isReachable === undefined
                    ? "Reachability: checking…"
                    : isReachable
                      ? "Reachable (live TCP check)"
                      : "Unreachable (live TCP check)"
                }
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-card)] ${
                  isReachable === undefined
                    ? "bg-zinc-400"
                    : isReachable
                      ? "bg-green-500"
                      : "bg-red-500"
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {server.name}
                </h3>
                {/* A4: replaces the old raw-enum badge ("INFO DETECTED") and
                    the static "SSH validated" badge (superseded by the A3
                    live reachability dot above) with a single clear,
                    actionable preparation-level label. */}
                <Badge tone={getServerOverallStatus(server).tone} dot>
                  {getServerOverallStatus(server).label}
                </Badge>
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
                Added on{" "}
                {new Date(server.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <div className="mt-2">
                <ServerToolBadges server={server} />
              </div>
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
