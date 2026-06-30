import type { Deployment } from "@/features/deployments/types";

/** Sépare une référence d'image (`host[:port]/path:tag`) en image + tag : le tag
 * n'existe que si le dernier `:` suit le dernier `/` (sinon c'est un port). */
export function splitImageRef(ref: string): { image: string; tag: string } {
  const lastColon = ref.lastIndexOf(":");
  const lastSlash = ref.lastIndexOf("/");
  if (lastColon > lastSlash && lastColon !== -1) {
    return { image: ref.slice(0, lastColon), tag: ref.slice(lastColon + 1) };
  }
  return { image: ref, tag: "" };
}

// Source unique du temps relatif : ré-exporté pour les consommateurs existants
// (project-deployments-tab, service-pipelines, deployments/[id]).
export { timeAgo } from "@/shared/lib/format-date";

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
  PRODUCTION: "border-red-500/30 bg-red-500/10 text-red-400",
  STAGING: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  TESTING: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  PREVIEW: "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
};

export const CONTAINER_STATUS_COLOR: Record<string, string> = {
  running: "text-green-400",
  stopped: "text-amber-400",
  not_found: "text-zinc-400",
  unknown: "text-zinc-400",
};

export const STATUS_COLOR: Record<string, string> = {
  SUCCESS: "text-green-400",
  RUNNING: "text-blue-400",
  FAILED: "text-red-400",
  PENDING: "text-amber-400",
  CANCELED: "text-zinc-400",
};

export const STATUS_DOT: Record<string, string> = {
  SUCCESS: "bg-green-400",
  RUNNING: "bg-blue-400 animate-pulse",
  FAILED: "bg-red-400",
  PENDING: "bg-amber-400 animate-pulse",
  CANCELED: "bg-zinc-400",
};

export const STATUS_BORDER: Record<string, string> = {
  SUCCESS: "border-l-green-500",
  RUNNING: "border-l-blue-500",
  FAILED: "border-l-red-500",
  PENDING: "border-l-amber-500",
  CANCELED: "border-l-zinc-500",
};
