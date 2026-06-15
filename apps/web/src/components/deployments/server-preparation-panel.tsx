'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wrench,
  X,
  XCircle,
  Minus,
} from 'lucide-react';
import { serversService } from '@/services/servers.service';
import { getApiErrorMessage } from '@/lib/api';
import type {
  ServerPreparation,
  ServerPreparationLog,
  ServerPreparationStatus,
  ServerPreparationTask,
  PreparationOptionDefinition,
  ServerPreparationProfile,
} from '@/types/server';

/* ── Status metadata ──────────────────────────────────────────────────── */

type PrepStatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  active: boolean;
};

const PREP_STATUS: Record<ServerPreparationStatus, PrepStatusMeta> = {
  QUEUED:            { label: 'Queued',           color: 'text-zinc-400',   bg: 'bg-zinc-500/10',  border: 'border-zinc-500/20',  icon: <Clock size={12} />,                              active: true  },
  RESOLVING_OPTIONS: { label: 'Resolving...',     color: 'text-blue-400',   bg: 'bg-blue-500/10',  border: 'border-blue-500/20',  icon: <Loader2 size={12} className="animate-spin" />,   active: true  },
  WAITING_FOR_LOCK:  { label: 'Waiting for lock', color: 'text-blue-400',   bg: 'bg-blue-500/10',  border: 'border-blue-500/20',  icon: <Clock size={12} />,                              active: true  },
  RUNNING:           { label: 'Running',          color: 'text-blue-400',   bg: 'bg-blue-500/10',  border: 'border-blue-500/20',  icon: <Loader2 size={12} className="animate-spin" />,   active: true  },
  SUCCEEDED:         { label: 'Succeeded',        color: 'text-green-400',  bg: 'bg-green-500/10', border: 'border-green-500/20', icon: <CheckCircle2 size={12} />,                        active: false },
  PARTIAL:           { label: 'Partial',          color: 'text-amber-400',  bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: <AlertTriangle size={12} />,                       active: false },
  FAILED:            { label: 'Failed',           color: 'text-red-400',    bg: 'bg-red-500/10',   border: 'border-red-500/20',   icon: <XCircle size={12} />,                             active: false },
  TIMEOUT:           { label: 'Timed out',        color: 'text-orange-400', bg: 'bg-orange-500/10',border: 'border-orange-500/20',icon: <Clock size={12} />,                              active: false },
  CANCELED:          { label: 'Canceled',         color: 'text-zinc-400',   bg: 'bg-zinc-500/10',  border: 'border-zinc-500/20',  icon: <X size={12} />,                                  active: false },
};

const TASK_STATUS_ICON: Record<ServerPreparationTask['status'], React.ReactNode> = {
  PENDING: <span className="h-3 w-3 rounded-full border border-zinc-500/50 bg-zinc-500/10" />,
  SKIPPED: <Minus size={12} className="text-zinc-500" />,
  RUNNING: <Loader2 size={12} className="animate-spin text-blue-400" />,
  OK:      <CheckCircle2 size={12} className="text-green-400" />,
  CHANGED: <CheckCircle2 size={12} className="text-teal-400" />,
  FAILED:  <XCircle size={12} className="text-red-400" />,
  TIMEOUT: <Clock size={12} className="text-orange-400" />,
};

const TASK_STATUS_COLOR: Record<ServerPreparationTask['status'], string> = {
  PENDING: 'text-[var(--text-muted)]',
  SKIPPED: 'text-[var(--text-muted)] line-through',
  RUNNING: 'text-blue-300 font-semibold',
  OK:      'text-green-300',
  CHANGED: 'text-teal-300',
  FAILED:  'text-red-300',
  TIMEOUT: 'text-orange-300',
};

const ACTIVE_STATUSES: ServerPreparationStatus[] = [
  'QUEUED', 'RESOLVING_OPTIONS', 'WAITING_FOR_LOCK', 'RUNNING',
];

/* ── Types ────────────────────────────────────────────────────────────── */

type Props = {
  serverId: string;
  serverLabel: string;
  missing: { binary: string; label: string; role: string; found: boolean }[];
  allOptions: PreparationOptionDefinition[];
  profiles: ServerPreparationProfile[];
  profileDefaults: Record<string, Partial<Record<string, boolean>>>;
  onBack: () => void;
  onDone: () => void;
};

/* ── Component ────────────────────────────────────────────────────────── */

export function ServerPreparationPanel({
  serverId, serverLabel, missing, allOptions, profiles, profileDefaults, onBack, onDone,
}: Props) {
  const [phase, setPhase] = useState<'loading' | 'form' | 'monitoring'>('loading');

  /* Active preparation state */
  const [prep, setPrep] = useState<ServerPreparation | null>(null);
  const [canceling, setCanceling] = useState(false);

  /* Live Ansible logs */
  const [logs, setLogs] = useState<ServerPreparationLog[]>([]);
  const lastLineRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  /* Form state */
  const [profile, setProfile] = useState<string>('CUSTOM');
  const [options, setOptions] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    allOptions.forEach((o) => {
      // Only pre-check tools that are actually missing on the server
      if (missing.some((m) => m.role === o.role)) init[o.key as string] = true;
    });
    return init;
  });
  const [showAllTools, setShowAllTools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Helpers ────────────────────────────────────────────────────────── */

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  /* Fetch only new log lines (afterLine) and append them. */
  const fetchLogs = async (id: string) => {
    try {
      const fresh = await serversService.getPreparationLogs(id, lastLineRef.current);
      if (fresh.length > 0) {
        lastLineRef.current = fresh[fresh.length - 1].lineNumber;
        setLogs((prev) => [...prev, ...fresh]);
      }
    } catch { /* keep polling */ }
  };

  const pollPrep = async (id: string) => {
    try {
      const updated = await serversService.getPreparation(id);
      setPrep(updated);
      await fetchLogs(id);
      if (!ACTIVE_STATUSES.includes(updated.status)) {
        stopPolling();
        if (updated.status === 'SUCCEEDED' || updated.status === 'PARTIAL') {
          onDone();
        }
      }
    } catch { /* keep polling */ }
  };

  const startMonitoring = (p: ServerPreparation) => {
    setPrep(p);
    setPhase('monitoring');
    stopPolling();
    // Reset the log buffer for the prep we are now watching
    setLogs([]);
    lastLineRef.current = 0;
    void fetchLogs(p.id);
    if (ACTIVE_STATUSES.includes(p.status)) {
      pollRef.current = setInterval(() => void pollPrep(p.id), 5000);
    }
  };

  /* ── Load active prep on mount ──────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    serversService.getPreparations(serverId)
      .then((list) => {
        if (cancelled) return;
        const active = list.find((p) => ACTIVE_STATUSES.includes(p.status));
        if (active) {
          startMonitoring(active);
        } else {
          // Show most recent finished prep for context, but go to form
          const recent = list[0] ?? null;
          if (recent) { setPrep(recent); }
          setPhase('form');
        }
      })
      .catch(() => { if (!cancelled) setPhase('form'); });
    return () => { cancelled = true; stopPolling(); };
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Cleanup on unmount */
  useEffect(() => () => stopPolling(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto-scroll the log viewer to the newest line */
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [logs, autoScroll]);

  /* ── Form helpers ───────────────────────────────────────────────────── */

  const isOptionEnabled = (key: string): boolean => {
    const explicit = options[key];
    if (typeof explicit === 'boolean') return explicit;
    return Boolean(profileDefaults[profile]?.[key]);
  };

  const toggleOption = (key: string, val: boolean) =>
    setOptions((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    setSubmitting(true); setFormError(null);
    try {
      const result = await serversService.prepare(serverId, {
        ...options,
        profile: profile as ServerPreparationProfile,
      });
      startMonitoring(result);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      if (msg.includes('already running') || msg.includes('already')) {
        // There's an active prep — reload
        const list = await serversService.getPreparations(serverId).catch(() => []);
        const active = list.find((p) => ACTIVE_STATUSES.includes(p.status));
        if (active) { startMonitoring(active); } else { setFormError(msg); }
      } else {
        setFormError(msg);
      }
    } finally { setSubmitting(false); }
  };

  const handleCancel = async () => {
    if (!prep) return;
    setCanceling(true);
    try {
      const updated = await serversService.cancelPreparation(prep.id);
      setPrep(updated);
      stopPolling();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally { setCanceling(false); }
  };

  /* ── LOADING ────────────────────────────────────────────────────────── */

  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Checking server preparation…
      </div>
    );
  }

  /* ── MONITORING VIEW ────────────────────────────────────────────────── */

  if (phase === 'monitoring' && prep) {
    const meta = PREP_STATUS[prep.status];
    const isActive = ACTIVE_STATUSES.includes(prep.status);
    const tasks = [...(prep.tasks ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);

    return (
      <div className="space-y-4">
        {/* Status banner */}
        <div className={`flex items-center justify-between gap-3 rounded-xl border ${meta.border} ${meta.bg} px-4 py-3`}>
          <div className="flex items-center gap-2">
            <span className={meta.color}>{meta.icon}</span>
            <div>
              <p className={`text-sm font-semibold ${meta.color}`}>
                Preparation {meta.label}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {serverLabel}
                {prep.startedAt && ` · started ${new Date(prep.startedAt as string).toLocaleTimeString('en-GB', { hour12: false })}`}
                {prep.finishedAt && ` · finished ${new Date(prep.finishedAt as string).toLocaleTimeString('en-GB', { hour12: false })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isActive && (
              <button type="button" onClick={() => void pollPrep(prep.id)}
                className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <RefreshCw size={9} /> Refresh
              </button>
            )}
            {isActive && (
              <button type="button" onClick={() => void handleCancel()} disabled={canceling}
                className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                {canceling ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />} Cancel
              </button>
            )}
          </div>
        </div>

        {/* Error message */}
        {prep.errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {prep.errorMessage as string}
          </div>
        )}

        {/* Summary */}
        {prep.summary && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            {prep.summary as string}
          </div>
        )}

        {/* Task list */}
        {tasks.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Tasks ({tasks.filter((t) => t.status === 'OK' || t.status === 'CHANGED').length}/{tasks.length} done)
            </p>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-app)]">
              {tasks.map((task) => (
                <div key={task.id}
                  className="flex items-start gap-2.5 border-b border-[var(--border)] px-3 py-2 last:border-0">
                  <span className="mt-0.5 shrink-0">{TASK_STATUS_ICON[task.status]}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs ${TASK_STATUS_COLOR[task.status]}`}>
                      {task.taskName}
                    </p>
                    {task.message && (
                      <p className="truncate text-[10px] text-[var(--text-muted)]">{task.message as string}</p>
                    )}
                    {task.status === 'SKIPPED' && !task.message && (
                      <p className="text-[10px] text-[var(--text-muted)]">skipped — previous task failed or timed out</p>
                    )}
                    {task.status === 'TIMEOUT' && (
                      <p className="text-[10px] text-orange-400/70">timed out — check the VPS network connection</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold uppercase ${TASK_STATUS_COLOR[task.status]}`}>
                    {task.status === 'CHANGED' ? 'changed' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Ansible logs */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Logs Ansible {isActive && <span className="text-blue-400">· en direct</span>}
              {logs.length > 0 && <span className="ml-1 text-[var(--text-muted)]">({logs.length})</span>}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <input type="checkbox" checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="accent-blue-500" />
                Auto-scroll
              </label>
              {!isActive && (
                <button type="button" onClick={() => void fetchLogs(prep.id)}
                  className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  <RefreshCw size={9} /> Refresh
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="text-[var(--text-muted)]">
                {isActive ? 'Waiting for the first lines…' : 'No logs available.'}
              </p>
            ) : (
              logs.map((log) => (
                <div key={log.id}
                  className={
                    log.level === 'ERROR' ? 'text-red-400'
                      : log.level === 'WARNING' ? 'text-amber-400'
                        : log.message.startsWith('TASK [') ? 'text-blue-300 font-semibold mt-1'
                          : log.message.startsWith('changed:') ? 'text-teal-300'
                            : log.message.startsWith('ok:') ? 'text-green-300'
                              : log.message.startsWith('failed:') || log.message.startsWith('fatal:') ? 'text-red-400'
                                : 'text-[var(--text-secondary)]'
                  }>
                  <span className="select-none text-[var(--text-muted)] opacity-50">{String(log.lineNumber).padStart(3, ' ')} </span>
                  {log.message}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Final state actions */}
        {!isActive && (
          <div className="space-y-2">
            {prep.status === 'TIMEOUT' && tasks.some((t) => t.status === 'TIMEOUT' && t.roleKey === 'docker') && (
              <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-[10px] text-orange-300">
                Docker timed out. Make sure the VPS can reach <code className="font-mono">download.docker.com</code> et que <code className="font-mono">systemctl start docker</code> ne bloque pas.
              </div>
            )}
            <div className="flex gap-2">
              {(prep.status === 'FAILED' || prep.status === 'TIMEOUT' || prep.status === 'PARTIAL') && (
                <button type="button"
                  onClick={() => {
                    setPhase('form');
                    const failedRoles = tasks
                      .filter((t) => t.status === 'FAILED' || t.status === 'TIMEOUT')
                      .map((t) => t.roleKey);
                    const prefill: Record<string, boolean> = {};
                    allOptions.forEach((o) => {
                      if (failedRoles.includes(o.role ?? '')) prefill[o.key as string] = true;
                    });
                    setOptions(prefill);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20">
                  <RotateCcw size={11} /> Retry
                </button>
              )}
              <button type="button" onClick={onBack}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <ChevronRight size={11} className="rotate-180" /> Back to deploy
              </button>
            </div>
          </div>
        )}

        {isActive && (
          <p className="text-[10px] text-[var(--text-muted)]">
            Auto-refreshing every 5s…
          </p>
        )}
      </div>
    );
  }

  /* ── FORM VIEW ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Context: last prep result (if any) */}
      {prep && !ACTIVE_STATUSES.includes(prep.status) && (
        <div className={`flex items-center gap-2 rounded-xl border ${PREP_STATUS[prep.status].border} ${PREP_STATUS[prep.status].bg} px-4 py-3 text-xs ${PREP_STATUS[prep.status].color}`}>
          {PREP_STATUS[prep.status].icon}
          <span>Last preparation: <strong>{PREP_STATUS[prep.status].label}</strong></span>
          {prep.finishedAt && (
            <span className="ml-1 text-[var(--text-muted)]">
              · {new Date(prep.finishedAt as string).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
        Ansible runs from the backend control node. The target VPS ({serverLabel}) remains an agentless SSH host.
      </div>

      {/* Error */}
      {formError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
          {formError}
        </div>
      )}

      {/* Missing tools warning */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <AlertTriangle size={12} /> Required tools missing on server
          </p>
          <div className="space-y-1">
            {missing.map((m) => (
              <div key={m.binary} className="flex items-center gap-2 text-xs">
                {m.found
                  ? <CheckCircle2 size={11} className="text-green-400" />
                  : <XCircle size={11} className="text-red-400" />}
                <span className={m.found ? 'text-green-300' : 'text-red-300'}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nixpacks without docker warning */}
      {isOptionEnabled('nixpacks') && !isOptionEnabled('docker') && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3 text-xs text-orange-300">
          <span className="font-semibold">Note:</span> Nixpacks builds Docker images — make sure Docker is already installed on this VPS, or add &quot;Docker Engine&quot; to this provisioning.
        </div>
      )}

      {/* Profile */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Profile</label>
        <select value={profile} onChange={(e) => setProfile(e.target.value)} disabled={submitting}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none">
          {(profiles.length > 0 ? profiles : ['CUSTOM']).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Tool options */}
      {allOptions.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Tools to install
            </label>
            <button type="button" onClick={() => setShowAllTools((v) => !v)}
              className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
              {showAllTools ? 'Show required only' : 'Show all tools'}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allOptions
              .filter((o) =>
                showAllTools ||
                isOptionEnabled(o.key as string) ||
                missing.some((m) => m.role === o.role)
              )
              .map((option) => {
                const checked = isOptionEnabled(option.key as string);
                const isMissing = missing.some((m) => m.role === option.role && !m.found);
                const isDockerRole = option.role === 'docker';
                return (
                  <label key={option.key as string}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition hover:border-[var(--text-secondary)] ${
                      isMissing ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--border)] bg-[var(--hover)]'
                    }`}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => toggleOption(option.key as string, e.target.checked)}
                      disabled={submitting}
                      className="mt-0.5 accent-zinc-500" />
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">{option.label}</span>
                        {isMissing && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">MISSING</span>}
                        {isDockerRole && checked && <span className="text-[9px] text-orange-400 font-semibold">~20 min</span>}
                        {option.recommended && !isMissing && !isDockerRole && <span className="text-[9px] font-semibold text-blue-400">✓ recommended</span>}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{option.description}</p>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      {/* Submit */}
      <button type="button" onClick={() => void handleSubmit()} disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
        {submitting ? 'Starting preparation…' : 'Run preparation'}
      </button>
    </div>
  );
}
