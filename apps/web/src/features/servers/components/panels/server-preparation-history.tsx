import { RotateCcw, Square } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { ServerPreparation } from "@/features/servers/types/server";

type Props = {
  preparations: ServerPreparation[];
  onOpenLogs: (preparation: ServerPreparation) => void;
  onRetry: (preparation: ServerPreparation) => void;
  onCancel?: (preparation: ServerPreparation) => void;
  retryingId?: string | null;
  cancelingId?: string | null;
};

function tone(status: ServerPreparation["status"]) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "TIMEOUT" || status === "CANCELED")
    return "error" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "info" as const;
}

export function ServerPreparationHistory({
  preparations,
  onOpenLogs,
  onRetry,
  onCancel,
  retryingId,
  cancelingId,
}: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        Setup
      </p>
      <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
        History and tasks
      </h3>
      {preparations.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          No setup has run yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {preparations.map((preparation) => (
            <div
              key={preparation.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone(preparation.status)}>
                      {preparation.status}
                    </Badge>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {preparation.profile} ·{" "}
                      {new Date(preparation.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {preparation.summary && (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {preparation.summary}
                    </p>
                  )}
                  {preparation.errorMessage && (
                    <p className="mt-2 text-sm text-red-400">
                      {preparation.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenLogs(preparation)}
                  >
                    View logs
                  </Button>
                  {(preparation.status === "FAILED" ||
                    preparation.status === "TIMEOUT") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRetry(preparation)}
                      loading={retryingId === preparation.id}
                      icon={
                        retryingId === preparation.id ? undefined : (
                          <RotateCcw size={13} />
                        )
                      }
                    >
                      Retry
                    </Button>
                  )}
                  {onCancel &&
                    [
                      "QUEUED",
                      "RESOLVING_OPTIONS",
                      "WAITING_FOR_LOCK",
                      "RUNNING",
                    ].includes(preparation.status) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onCancel(preparation)}
                        loading={cancelingId === preparation.id}
                        icon={
                          cancelingId === preparation.id ? undefined : (
                            <Square size={13} />
                          )
                        }
                      >
                        Cancel
                      </Button>
                    )}
                </div>
              </div>
              {preparation.tasks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preparation.tasks.map((task) => (
                    <Badge
                      key={task.id}
                      tone={task.status === "OK" ? "success" : "default"}
                      size="sm"
                    >
                      {task.roleKey}: {task.status}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
