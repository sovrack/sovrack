"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Loader2,
  StopCircle,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { LogTerminal } from "@/shared/common/log-terminal";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  useAutomationRun,
  useAutomationRunLogs,
  useCancelAutomationRun,
} from "@/features/automation/api/use-automation";
import { useAutomationLogStream } from "@/features/automation/api/use-automation-log-stream";
import type {
  AutomationRun,
  AutomationRunLog,
  AutomationRunStatus,
  AutomationTargetStatus,
} from "@/features/automation/types/automation";

type Props = { params: Promise<{ id: string }> };

const ACTIVE_STATUSES: AutomationRunStatus[] = ["QUEUED", "RUNNING"];

function runStatusTone(status: AutomationRunStatus) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "PARTIAL" || status === "TIMEOUT") return "warning" as const;
  if (status === "FAILED" || status === "CANCELED") return "error" as const;
  return "info" as const;
}

function targetStatusTone(status: AutomationTargetStatus) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "TIMEOUT") return "error" as const;
  if (status === "SKIPPED") return "default" as const;
  if (status === "RUNNING") return "info" as const;
  return "default" as const;
}

function targetStatusIcon(status: AutomationTargetStatus) {
  if (status === "SUCCEEDED")
    return <CheckCircle size={13} className="text-green-400" />;
  if (status === "FAILED" || status === "TIMEOUT")
    return <XCircle size={13} className="text-red-400" />;
  if (status === "RUNNING")
    return <Loader2 size={13} className="animate-spin text-blue-400" />;
  return <Clock size={13} className="text-[var(--text-muted)]" />;
}

function formatDate(str: string | null | undefined): string {
  if (!str) return "—";
  return new Date(str).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function duration(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "—";
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function AutomationRunDetailPage({ params }: Props) {
  const { id } = use(params);
  const [streamedLogs, setStreamedLogs] = useState<AutomationRunLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useAutomationRun(id);
  const logsQuery = useAutomationRunLogs(id);
  const cancelRun = useCancelAutomationRun();

  const run = runQuery.data;
  const isActive = run ? ACTIVE_STATUSES.includes(run.status) : false;

  useEffect(() => {
    setStreamedLogs([]);
  }, [id]);

  useAutomationLogStream({
    runId: id,
    onLog: (log) => {
      setStreamedLogs((prev) => {
        if (prev.some((l) => l.id === log.id)) return prev;
        return [...prev, log];
      });
    },
  });

  const displayedLogs = useMemo(() => {
    const map = new Map<string, AutomationRunLog>();
    const persisted = run?.logs ?? [];
    const polled = logsQuery.data ?? [];
    for (const log of [...persisted, ...polled, ...streamedLogs]) {
      map.set(log.id, log);
    }
    return Array.from(map.values()).sort((a, b) => a.lineNumber - b.lineNumber);
  }, [run?.logs, logsQuery.data, streamedLogs]);

  const logLines = useMemo(
    () =>
      displayedLogs.map((l) => ({
        timestamp: l.createdAt ?? new Date().toISOString(),
        message: `[${l.source}] ${l.message}`,
        level: (l.level === "ERROR" ? "error" : "info") as "error" | "info",
      })),
    [displayedLogs],
  );

  const handleCancel = async (r: AutomationRun) => {
    try {
      setError(null);
      await cancelRun.mutateAsync(r.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  if (runQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2
          size={24}
          className="animate-spin text-[var(--text-secondary)]"
        />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Link href="/automation">
          <Button variant="secondary" icon={<ArrowLeft size={16} />}>
            Back to Automation
          </Button>
        </Link>
        <SectionCard title="Run not found">
          <p className="text-sm text-[var(--text-secondary)]">
            This automation run may have been deleted.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title={run.actionLabel}
        description={`Run ${run.id.slice(0, 8)} · ${run.targets.length} server(s)`}
        actions={
          <>
            <Link href="/automation">
              <Button variant="secondary" icon={<ArrowLeft size={16} />}>
                Back
              </Button>
            </Link>
            {isActive && (
              <Button
                variant="danger"
                icon={
                  cancelRun.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <StopCircle size={14} />
                  )
                }
                loading={cancelRun.isPending}
                onClick={() => void handleCancel(run)}
              >
                Cancel Run
              </Button>
            )}
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Run metadata */}
      <SectionCard title="Run details" contentClassName="p-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Status
            </p>
            <div className="mt-1">
              <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Action
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
              {run.actionKey}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Started
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {formatDate(run.startedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Duration
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {duration(run.startedAt, run.finishedAt)}
              {isActive && (
                <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </p>
          </div>
          {run.requestedBy && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Requested by
              </p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {run.requestedBy.fullName}
              </p>
            </div>
          )}
          {run.summary && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Summary
              </p>
              <p className="mt-1 text-sm text-[var(--text-primary)]">
                {run.summary}
              </p>
            </div>
          )}
          {run.errorMessage && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-400">
                Error
              </p>
              <p className="mt-1 text-sm text-red-300">{run.errorMessage}</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Per-server results */}
      <SectionCard
        title="Server targets"
        description="Result per target server."
      >
        <div className="space-y-2">
          {run.targets.map((target) => (
            <div
              key={target.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--hover)] px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {targetStatusIcon(target.status)}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {target.server.name}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    {target.server.host}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {target.startedAt && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {duration(target.startedAt, target.finishedAt)}
                  </span>
                )}
                <Badge tone={targetStatusTone(target.status)} size="sm">
                  {target.status}
                </Badge>
              </div>
              {target.errorMessage && (
                <p className="mt-1 text-xs text-red-400 col-span-2">
                  {target.errorMessage}
                </p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Logs */}
      <SectionCard
        title="Execution Logs"
        description={
          isActive
            ? "Live logs streamed from Ansible control node."
            : "Logs from this automation run."
        }
      >
        {logLines.length === 0 && !isActive ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No logs available.
          </p>
        ) : (
          <LogTerminal logs={logLines} isLive={isActive} />
        )}
      </SectionCard>
    </div>
  );
}
