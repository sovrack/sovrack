'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Play, StopCircle, Trash2 } from 'lucide-react';
import { PageHeader } from '@/shared/layout/page-header';
import { SectionCard } from '@/shared/layout/section-card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { getApiErrorMessage } from '@/shared/lib/api';
import {
  useAutomationActions,
  useAutomationRun,
  useAutomationRunLogs,
  useAutomationRuns,
  useCancelAutomationRun,
  useDeleteAutomationRun,
  useStartAutomationRun,
} from '@/features/automation/api/use-automation';
import { useAutomationLogStream } from '@/features/automation/api/use-automation-log-stream';
import { useServers } from '@/features/servers/api/use-servers';
import { useConfirm } from '@/shared/contexts/confirm-context';
import type { AutomationRun, AutomationRunLog, AutomationRunStatus } from '@/features/automation/types/automation';

const ACTIVE_RUN_STATUSES: AutomationRunStatus[] = ['QUEUED', 'RUNNING'];
const AUTOMATION_STATUS_FILTERS: Array<'ALL' | AutomationRunStatus> = [
  'ALL',
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'CANCELED',
  'TIMEOUT',
];

function statusTone(status: AutomationRunStatus) {
  if (status === 'SUCCEEDED') return 'success' as const;
  if (status === 'PARTIAL' || status === 'TIMEOUT') return 'warning' as const;
  if (status === 'FAILED' || status === 'CANCELED') return 'error' as const;
  return 'info' as const;
}

export default function AutomationPage() {
  const serversQuery = useServers();
  const actionsQuery = useAutomationActions();
  const runsQuery = useAutomationRuns(1, 25);
  const startRun = useStartAutomationRun();
  const cancelRun = useCancelAutomationRun();
  const deleteRun = useDeleteAutomationRun();
  const confirm = useConfirm();
  const [showHistory, setShowHistory] = useState(false);

  const [selectedActionKey, setSelectedActionKey] = useState('');
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [gitlabRunnerExecutor, setGitlabRunnerExecutor] = useState('docker');
  const [error, setError] = useState<string | null>(null);
  const [streamedLogs, setStreamedLogs] = useState<AutomationRunLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AutomationRunStatus>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | string>('ALL');

  const runs = runsQuery.data?.items;
  const actionList = actionsQuery.data;
  const selectedAction = (actionList ?? []).find(
    (action) => action.key === selectedActionKey,
  );
  const selectedRunQuery = useAutomationRun(selectedRunId);
  const selectedRunLogsQuery = useAutomationRunLogs(selectedRunId);
  const selectedRun = selectedRunQuery.data;

  useEffect(() => {
    if (!selectedActionKey && actionList && actionList.length > 0) {
      setSelectedActionKey(actionList[0].key);
    }
  }, [actionList, selectedActionKey]);

  useEffect(() => {
    if (!selectedRunId && runs && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    setStreamedLogs([]);
  }, [selectedRunId]);

  useAutomationLogStream({
    runId: selectedRunId,
    onLog: (log) => {
      setStreamedLogs((prev) => {
        if (prev.some((item) => item.id === log.id)) {
          return prev;
        }
        return [...prev, log];
      });
    },
  });

  const displayedLogs = useMemo(() => {
    const map = new Map<string, AutomationRunLog>();
    const persisted = selectedRun?.logs ?? [];
    const polled = selectedRunLogsQuery.data ?? [];
    for (const log of [...persisted, ...polled, ...streamedLogs]) {
      map.set(log.id, log);
    }
    return Array.from(map.values()).sort((a, b) => a.lineNumber - b.lineNumber);
  }, [selectedRun?.logs, selectedRunLogsQuery.data, streamedLogs]);

  const actionOptions = useMemo(() => {
    const source = runs ?? [];
    return Array.from(new Set(source.map((run) => run.actionKey))).sort();
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const source = runs ?? [];
    return source.filter((run) => {
      const statusMatch = statusFilter === 'ALL' || run.status === statusFilter;
      const actionMatch = actionFilter === 'ALL' || run.actionKey === actionFilter;
      return statusMatch && actionMatch;
    });
  }, [actionFilter, runs, statusFilter]);

  useEffect(() => {
    if (!filteredRuns.length) {
      return;
    }
    if (!selectedRunId || !filteredRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(filteredRuns[0].id);
    }
  }, [filteredRuns, selectedRunId]);

  const stats = useMemo(() => {
    const source = runs ?? [];
    return {
      total: source.length,
      running: source.filter((run) => ACTIVE_RUN_STATUSES.includes(run.status)).length,
      succeeded: source.filter((run) => run.status === 'SUCCEEDED').length,
      failed: source.filter((run) =>
        run.status === 'FAILED' || run.status === 'CANCELED' || run.status === 'TIMEOUT',
      ).length,
    };
  }, [runs]);

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId],
    );
  };

  const handleStart = async () => {
    if (!selectedActionKey || selectedServerIds.length === 0) {
      setError('Select an automation action and at least one target server.');
      return;
    }
    setError(null);
    try {
      const run = await startRun.mutateAsync({
        actionKey: selectedActionKey,
        serverIds: selectedServerIds,
        ...(selectedAction?.roles?.includes('gitlab_runner')
          ? { gitlabRunnerExecutor }
          : {}),
      });
      setSelectedRunId(run.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const handleCancel = async (run: AutomationRun) => {
    try {
      setError(null);
      await cancelRun.mutateAsync(run.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const serverList = serversQuery.data ?? [];
  const launchDisabled =
    startRun.isPending || !selectedActionKey || selectedServerIds.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Automation"
        description="Run controlled multi-VPS Ansible operations from the control node. Target VPS hosts stay SSH agentless and do not install Ansible."
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Total runs</p>
          <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Running</p>
          <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{stats.running}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Succeeded</p>
          <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{stats.succeeded}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--text-muted)]">Failed</p>
          <p className="mt-1 text-3xl font-bold text-[var(--text-primary)]">{stats.failed}</p>
        </div>
      </div>

      <SectionCard
        title="Launch Automation"
        description="Select one allowlisted action and one or many verified servers."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Action
            </label>
            <select
              value={selectedActionKey}
              onChange={(event) => setSelectedActionKey(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
            >
              {(actionList ?? []).map((action) => (
                <option key={action.key} value={action.key}>
                  {action.label}
                </option>
              ))}
            </select>
            {selectedAction && (
              <p className="text-xs text-[var(--text-secondary)]">
                {selectedAction.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Target Servers
            </label>
            <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--hover)] p-3">
              {serverList.length === 0 && (
                <p className="text-xs text-[var(--text-secondary)]">
                  No servers available.
                </p>
              )}
              {serverList.map((server) => (
                <label
                  key={server.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {server.name} ({server.host})
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedServerIds.includes(server.id)}
                    onChange={() => toggleServer(server.id)}
                    disabled={!server.isVerified}
                    className="accent-zinc-600"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {selectedAction?.roles?.includes('gitlab_runner') && (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              GitLab Runner Executor
            </label>
            <select
              value={gitlabRunnerExecutor}
              onChange={(event) => setGitlabRunnerExecutor(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
            >
              <option value="docker">docker</option>
              <option value="shell">shell</option>
            </select>
          </div>
        )}

        <div className="mt-4">
          <Button
            onClick={() => void handleStart()}
            loading={startRun.isPending}
            disabled={launchDisabled}
            icon={startRun.isPending ? undefined : <Play size={14} />}
          >
            Execute Automation
          </Button>
        </div>
      </SectionCard>

      {/* History toggle button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {runs && runs.length > 0 ? `${runs.length} run(s) in history` : 'No history yet'}
        </p>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        >
          {showHistory ? 'Hide history' : 'View history'}
        </button>
      </div>

      {showHistory && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Run History" description="Latest multi-server automation runs.">
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'ALL' | AutomationRunStatus)
              }
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
            >
              {AUTOMATION_STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === 'ALL' ? 'All statuses' : status}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-primary)] outline-none"
            >
              <option value="ALL">All actions</option>
              {actionOptions.map((actionKey) => (
                <option key={actionKey} value={actionKey}>
                  {actionKey}
                </option>
              ))}
            </select>
          </div>

          {!runs || runs.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No automation runs yet.
            </p>
          ) : filteredRuns.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No automation run matches the selected filters.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRuns.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    selectedRunId === run.id
                      ? 'border-zinc-500/60 bg-[var(--hover)]'
                      : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {run.actionLabel}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={statusTone(run.status)} size="sm">
                        {run.status}
                      </Badge>
                      <Link
                        href={`/automation/${run.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
                        title="View full detail"
                      >
                        <ExternalLink size={12} />
                      </Link>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirm({ title: 'Delete this run?', confirmLabel: 'Delete', variant: 'danger' })) {
                            void deleteRun.mutateAsync(run.id).then(() => {
                              if (selectedRunId === run.id) setSelectedRunId(null);
                            });
                          }
                        }}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-red-400 transition"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {new Date(run.createdAt).toLocaleString()} · {run.targets.length} target(s)
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Run Details"
          description={
            selectedRun
              ? `${selectedRun.actionLabel} (${selectedRun.id.slice(0, 8)})`
              : 'Select a run from history.'
          }
        >
          {!selectedRun ? (
            <p className="text-sm text-[var(--text-secondary)]">No run selected.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(selectedRun.status)}>
                  {selectedRun.status}
                </Badge>
                {ACTIVE_RUN_STATUSES.includes(selectedRun.status) && (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<StopCircle size={13} />}
                    loading={cancelRun.isPending}
                    onClick={() => void handleCancel(selectedRun)}
                  >
                    Cancel run
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {selectedRun.targets.map((target) => (
                  <div
                    key={target.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {target.server.name}
                      </p>
                      <Badge tone={target.status === 'SUCCEEDED' ? 'success' : target.status === 'FAILED' ? 'error' : target.status === 'TIMEOUT' ? 'warning' : 'default'} size="sm">
                        {target.status}
                      </Badge>
                    </div>
                    {target.errorMessage && (
                      <p className="mt-1 text-xs text-red-400">{target.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-black p-3 font-mono text-xs text-zinc-100">
                <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  Live Logs
                </p>
                <div className="max-h-72 space-y-1 overflow-auto">
                  {displayedLogs.length === 0 ? (
                    <p className="text-zinc-500">Waiting for logs...</p>
                  ) : (
                    displayedLogs.map((log) => (
                      <p
                        key={log.id}
                        className={
                          log.level === 'ERROR'
                            ? 'text-red-300'
                            : log.level === 'WARNING'
                              ? 'text-yellow-200'
                              : 'text-zinc-100'
                        }
                      >
                        <span className="text-zinc-500">
                          {String(log.lineNumber).padStart(4, '0')}
                        </span>{' '}
                        <span className="text-zinc-500">[{log.source}]</span>{' '}
                        {log.message}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>}
    </div>
  );
}
