"use client";

import { useState } from "react";
import { ScrollText, X } from "lucide-react";
import {
  useServerPreparations,
  useRetryPreparation,
  useCancelPreparation,
} from "@/features/servers/api/use-server-preparation";
import { ServerPreparationHistory } from "@/features/servers/components/panels/server-preparation-history";
import { ServerPreparationLogViewer } from "@/features/servers/components/panels/server-preparation-log-viewer";
import type { ServerPreparation } from "@/features/servers/types/server";

/**
 * Dialog « Logs Ansible » d'un VPS : historique des préparations (verify/prepare)
 * + logs Ansible en direct de chacune. Réutilise les composants existants
 * (ServerPreparationHistory + ServerPreparationLogViewer + leurs hooks).
 */
export function ServerLogsDialog({
  serverId,
  serverName,
  open,
  onClose,
}: {
  serverId: string | null;
  serverName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ServerPreparation | null>(null);
  const preparationsQuery = useServerPreparations(serverId ?? "");
  const retryPreparation = useRetryPreparation();
  const cancelPreparation = useCancelPreparation();

  if (!open || !serverId) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />
        <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <ScrollText size={15} /> Logs Ansible — {serverName ?? "serveur"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]"
            >
              <X size={13} />
            </button>
          </div>
          <div className="overflow-auto px-5 py-4">
            <ServerPreparationHistory
              preparations={preparationsQuery.data ?? []}
              onOpenLogs={setSelected}
              retryingId={
                retryPreparation.isPending
                  ? retryPreparation.variables?.id
                  : null
              }
              cancelingId={
                cancelPreparation.isPending
                  ? (cancelPreparation.variables ?? null)
                  : null
              }
              onRetry={(preparation) => {
                retryPreparation.mutate({
                  id: preparation.id,
                  reason: "Retry depuis les logs serveur",
                });
              }}
              onCancel={(preparation) => {
                cancelPreparation.mutate(preparation.id);
              }}
            />
          </div>
        </div>
      </div>

      <ServerPreparationLogViewer
        preparation={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
