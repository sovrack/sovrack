import { RotateCcw, Square } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { ServerSetup } from "@/features/servers/types/server";

type Props = {
  setups: ServerSetup[];
  onOpenLogs: (setup: ServerSetup) => void;
  onRetry: (setup: ServerSetup) => void;
  onCancel?: (setup: ServerSetup) => void;
  retryingId?: string | null;
  cancelingId?: string | null;
};

function tone(status: ServerSetup["status"]) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "TIMEOUT" || status === "CANCELED")
    return "error" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "info" as const;
}

export function ServerSetupHistory({
  setups,
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
      {setups.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          No setup has run yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {setups.map((setup) => (
            <div
              key={setup.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone(setup.status)}>
                      {setup.status}
                    </Badge>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {setup.profile} ·{" "}
                      {new Date(setup.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {setup.summary && (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {setup.summary}
                    </p>
                  )}
                  {setup.errorMessage && (
                    <p className="mt-2 text-sm text-red-400">
                      {setup.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenLogs(setup)}
                  >
                    View logs
                  </Button>
                  {(setup.status === "FAILED" ||
                    setup.status === "TIMEOUT") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onRetry(setup)}
                      loading={retryingId === setup.id}
                      icon={
                        retryingId === setup.id ? undefined : (
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
                    ].includes(setup.status) && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => onCancel(setup)}
                        loading={cancelingId === setup.id}
                        icon={
                          cancelingId === setup.id ? undefined : (
                            <Square size={13} />
                          )
                        }
                      >
                        Cancel
                      </Button>
                    )}
                </div>
              </div>
              {setup.tasks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {setup.tasks.map((task) => (
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
