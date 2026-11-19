/**
 * Centralised React Query key factory for the projects feature.
 *
 * Using a single source of truth for query keys ensures that
 * invalidateQueries() calls in components always match the keys declared in
 * hooks — a string mismatch is a silent bug that causes stale UI after
 * mutations. Pattern mirrors server-query-keys.ts in the servers feature.
 */
export const projectKeys = {
  all: ["projects"] as const,

  lists: () => [...projectKeys.all] as const,

  detail: (projectId: string) => ["project", projectId] as const,

  environments: (projectId: string) =>
    ["project", projectId, "environments"] as const,

  services: (projectId: string) =>
    ["project", projectId, "services"] as const,

  // Sensitive DATABASE credentials, cached per service and separate from the
  // services list key so they are only ever fetched by the dedicated,
  // on-demand endpoint (never bundled into the general listing).
  serviceCredentials: (projectId: string, serviceId: string) =>
    ["project", projectId, "service", serviceId, "credentials"] as const,

  // B3 fix: keyed by serviceId too — a project can hold several GIT services
  // (1 service = 1 repo), so caching branches under projectId alone caused
  // the SECOND service configured to silently show the FIRST service's
  // cached branch list. `serviceId` defaults to null (not undefined) so the
  // key shape stays stable whether or not a caller knows it yet.
  branches: (projectId: string, serviceId?: string) =>
    ["project", projectId, "branches", serviceId ?? null] as const,

  deployments: (projectId: string) =>
    ["deployments", "project", projectId] as const,
};
