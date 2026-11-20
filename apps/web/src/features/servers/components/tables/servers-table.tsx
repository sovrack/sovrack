"use client";

import { useState } from "react";
import { Check, Copy, Server as ServerIcon, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { getServerOverallStatus } from "@/features/servers/components/shared/server-status-badges";
import { ServerRowActionsMenu } from "@/features/servers/components/shared/server-row-actions-menu";
import type { Server } from "@/features/servers/types/server";

type ServersTableProps = {
  servers: Server[];
  isReachable: Record<string, boolean | undefined>;
  getServerBusy: (server: Server) => boolean;
  onOpenTerminal: (server: Server) => void;
  readOnly?: boolean;
  onOpenSetup: (server: Server) => void;
  onOpenMonitoring: (server: Server) => void;
  onOpenDetails: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
  onValidateSsh?: (server: Server) => void;
};

function ReachabilityDot({ value }: { value: boolean | undefined }) {
  return (
    <span
      title={
        value === undefined
          ? "Reachability: checking…"
          : value
            ? "Reachable (live TCP check)"
            : "Unreachable (live TCP check)"
      }
      className={`h-2 w-2 shrink-0 rounded-full ${
        value === undefined
          ? "bg-muted"
          : value
            ? "bg-green-500"
            : "bg-red-500"
      }`}
    />
  );
}

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
const td = "px-3 py-2.5 align-middle";

function SshVerifiedBadge({ isVerified }: { isVerified: boolean | null }) {
  if (isVerified === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        Pending
      </span>
    );
  }
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400">
        <Check size={12} />
        Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-400">
      <X size={12} />
      Failed
    </span>
  );
}

/**
 * Compact server table (Task 2, "Sécurité database + UI" mission) —
 * replaces the previous large-card list. Deliberately does NOT show
 * installed-tool badges (Docker/Nginx/Nixpacks…) — that detail now lives
 * only in the View Details panel (ServerDetailsDialog), per the task.
 */
export function ServersTable({
  servers,
  readOnly,
  isReachable,
  getServerBusy,
  onOpenTerminal,
  onOpenSetup,
  onOpenMonitoring,
  onOpenDetails,
  onEdit,
  onDelete,
  onValidateSsh,
}: ServersTableProps) {
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyIp = (id: string, host: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(host);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card  touch-pan-x">
      <div className="flex items-center justify-between border-b border-border bg-card px-3.5 py-1.5 text-[11px] text-muted md:hidden">
        <span>↔ {viewMode === "table" ? "Faites défiler horizontalement" : "Vue en cartes activée"}</span>
        <div className="flex items-center rounded-lg border border-border bg-app p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
              viewMode === "table"
                ? "bg-accent text-accent-foreground "
                : "text-muted hover:text-primary"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
              viewMode === "cards"
                ? "bg-accent text-accent-foreground "
                : "text-muted hover:text-primary"
            }`}
          >
            Cartes
          </button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="space-y-3 p-3 md:hidden">
          {servers.map((server) => {
            const status = getServerOverallStatus(server);
            return (
              <div
                key={server.id}
                className="space-y-3 rounded-lg border border-border bg-app p-3.5 "
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ReachabilityDot value={isReachable[server.id]} />
                    <ServerIcon
                      size={15}
                      className="shrink-0 text-muted"
                    />
                    <span className="truncate font-semibold text-sm text-primary">
                      {server.name}
                    </span>
                  </div>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-hover/10/60 px-2.5 py-1.5">
                    <span className="text-muted">IP</span>
                    <button
                      type="button"
                      onClick={() => handleCopyIp(server.id, server.host)}
                      className="flex items-center gap-1 font-mono text-primary hover:underline"
                      title="Copier l'adresse IP"
                    >
                      {server.host}
                      {copiedId === server.id ? (
                        <Check size={11} className="text-green-400" />
                      ) : (
                        <Copy size={11} className="text-muted" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-hover/10/60 px-2.5 py-1.5">
                    <span className="text-muted">Port</span>
                    <span className="font-mono text-primary">
                      {server.port}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-hover/10/60 px-2.5 py-1.5">
                    <span className="text-muted">User</span>
                    <span className="font-mono text-primary truncate max-w-[80px]">
                      {server.username}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-hover/10/60 px-2.5 py-1.5">
                    <span className="text-muted">SSH</span>
                    <SshVerifiedBadge isVerified={server.isVerified} />
                  </div>
                </div>

                {!readOnly && (
                  <div className="flex items-center justify-end border-t border-border pt-2">
                    <ServerRowActionsMenu
                      server={server}
                      disabled={getServerBusy(server)}
                      onOpenTerminal={onOpenTerminal}
                      onOpenSetup={onOpenSetup}
                      onOpenMonitoring={onOpenMonitoring}
                      onOpenDetails={onOpenDetails}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onValidateSsh={onValidateSsh}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <table
        className={`w-full min-w-[860px] border-collapse text-sm ${
          viewMode === "cards" ? "hidden md:table" : ""
        }`}
      >
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Name</th>
            <th className={th}>Status</th>
            <th className={th}>IP Address</th>
            <th className={th}>Port</th>
            <th className={th}>Username</th>
            <th className={th}>SSH Key</th>
            <th className={th}>SSH Verified</th>
            <th className={th}>Created</th>
            <th className={`${th} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => {
            const status = getServerOverallStatus(server);
            const hasSshKey = Boolean(server.sshPublicKey);
            return (
              <tr
                key={server.id}
                className="border-b border-border transition last:border-0 hover:bg-hover/10"
              >
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <ReachabilityDot value={isReachable[server.id]} />
                    <ServerIcon size={14} className="shrink-0 text-muted" />
                    <span className="truncate font-medium text-primary">
                      {server.name}
                    </span>
                  </div>
                </td>
                <td className={td}>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className={`${td} font-mono text-xs text-secondary`}>
                  {server.host}
                </td>
                <td className={`${td} font-mono text-xs text-secondary`}>
                  {server.port}
                </td>
                <td className={`${td} font-mono text-xs text-secondary`}>
                  {server.username}
                </td>
                <td className={td}>
                  {hasSshKey ? (
                    <Check size={15} className="text-green-400" aria-label="SSH key configured" />
                  ) : (
                    <X size={15} className="text-muted" aria-label="No SSH key" />
                  )}
                </td>
                <td className={td}>
                  <SshVerifiedBadge isVerified={server.isVerified} />
                </td>
                <td className={`${td} text-xs text-secondary`}>
                  {new Date(server.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td className={`${td} text-right`}>
                  {!readOnly && (<ServerRowActionsMenu
                    server={server}
                    disabled={getServerBusy(server)}
                    onOpenTerminal={onOpenTerminal}
                    onOpenSetup={onOpenSetup}
                    onOpenMonitoring={onOpenMonitoring}
                    onOpenDetails={onOpenDetails}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onValidateSsh={onValidateSsh}
                  />)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
