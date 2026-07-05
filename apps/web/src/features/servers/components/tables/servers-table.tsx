"use client";

import { Check, Server as ServerIcon, X } from "lucide-react";
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
  onOpenDetails: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
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
          ? "bg-zinc-400"
          : value
            ? "bg-green-500"
            : "bg-red-500"
      }`}
    />
  );
}

const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";
const td = "px-3 py-2.5 align-middle";

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
  onOpenDetails,
  onEdit,
  onDelete,
}: ServersTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className={th}>Name</th>
            <th className={th}>Status</th>
            <th className={th}>IP Address</th>
            <th className={th}>Port</th>
            <th className={th}>Username</th>
            <th className={th}>SSH Key</th>
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
                className="border-b border-[var(--border)] transition last:border-0 hover:bg-[var(--hover)]"
              >
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <ReachabilityDot value={isReachable[server.id]} />
                    <ServerIcon size={14} className="shrink-0 text-[var(--text-muted)]" />
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {server.name}
                    </span>
                  </div>
                </td>
                <td className={td}>
                  <Badge tone={status.tone} dot>
                    {status.label}
                  </Badge>
                </td>
                <td className={`${td} font-mono text-xs text-[var(--text-secondary)]`}>
                  {server.host}
                </td>
                <td className={`${td} font-mono text-xs text-[var(--text-secondary)]`}>
                  {server.port}
                </td>
                <td className={`${td} font-mono text-xs text-[var(--text-secondary)]`}>
                  {server.username}
                </td>
                <td className={td}>
                  {hasSshKey ? (
                    <Check size={15} className="text-green-400" aria-label="SSH key configured" />
                  ) : (
                    <X size={15} className="text-[var(--text-muted)]" aria-label="No SSH key" />
                  )}
                </td>
                <td className={`${td} text-xs text-[var(--text-secondary)]`}>
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
                    onOpenDetails={onOpenDetails}
                    onEdit={onEdit}
                    onDelete={onDelete}
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
