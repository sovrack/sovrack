import type { Deployment } from '@/types/deployment';

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function dur(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function resolveDeploymentUrl(dep: Deployment): string | null {
  if (dep.publicUrl) return dep.publicUrl;
  const targets = dep.environment?.serviceTargets ?? [];
  const target = dep.serviceId
    ? targets.find((t) => t.serviceId === dep.serviceId)
    : targets[0];
  const srv =
    target?.server ??
    (dep.environment as unknown as { server?: { host: string } })?.server;
  if (!srv) return null;
  if (target?.domain) return `http://${target.domain}`;
  if (target?.port)
    return `http://${(srv as { host: string }).host}:${String(target.port)}`;
  return null;
}

export const ENV_BADGE: Record<string, string> = {
  PRODUCTION: 'border-red-500/30 bg-red-500/10 text-red-400',
  STAGING:    'border-blue-500/30 bg-blue-500/10 text-blue-400',
  TESTING:    'border-amber-500/30 bg-amber-500/10 text-amber-400',
  PREVIEW:    'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
};

export const STATUS_DOT: Record<string, string> = {
  SUCCESS:  'bg-green-400',
  RUNNING:  'bg-blue-400 animate-pulse',
  FAILED:   'bg-red-400',
  PENDING:  'bg-amber-400 animate-pulse',
  CANCELED: 'bg-zinc-400',
};

export const STATUS_BORDER: Record<string, string> = {
  SUCCESS:  'border-l-green-500',
  RUNNING:  'border-l-blue-500',
  FAILED:   'border-l-red-500',
  PENDING:  'border-l-amber-500',
  CANCELED: 'border-l-zinc-500',
};

export const STATUS_TEXT: Record<string, string> = {
  SUCCESS:  'text-green-400',
  RUNNING:  'text-blue-400',
  FAILED:   'text-red-400',
  PENDING:  'text-amber-400',
  CANCELED: 'text-zinc-400',
};
