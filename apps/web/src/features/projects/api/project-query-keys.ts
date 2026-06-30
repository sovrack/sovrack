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

  branches: (projectId: string) =>
    ["project", projectId, "branches"] as const,

  deployments: (projectId: string) =>
    ["deployments", "project", projectId] as const,
};
