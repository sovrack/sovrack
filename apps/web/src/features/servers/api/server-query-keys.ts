export const FINISHED_PREPARATION_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMEOUT",
  "CANCELED",
  "PARTIAL",
]);

export const ACTIVE_PREPARATION_STATUSES = new Set([
  "QUEUED",
  "RESOLVING_OPTIONS",
  "WAITING_FOR_LOCK",
  "RUNNING",
]);

export const serverKeys = {
  all: ["servers"] as const,
  adminList: () => [...serverKeys.all, "admin-list"] as const,
  list: () => [...serverKeys.all, "list"] as const,
  reachability: () => [...serverKeys.all, "reachability"] as const,
  detail: (id: string) => [...serverKeys.all, "detail", id] as const,
  setupOptions: () => [...serverKeys.all, "setup-options"] as const,
  setup: (id: string) => [...serverKeys.all, "setup", id] as const,
  capabilities: (id: string) =>
    [...serverKeys.all, "capabilities", id] as const,
  installedTools: (id: string) =>
    [...serverKeys.all, "installed-tools", id] as const,
  setups: (id: string) =>
    [...serverKeys.all, "setups", id] as const,
  setupReadiness: (id: string) =>
    [...serverKeys.all, "setup-readiness", id] as const,
  validationResults: (id: string) =>
    [...serverKeys.all, "validation-results", id] as const,
  setupLogs: (id: string) =>
    [...serverKeys.all, "setup-logs", id] as const,
  auditEvents: (id: string) => [...serverKeys.all, "audit-events", id] as const,
  dockerConnection: (id: string) =>
    [...serverKeys.all, "docker-connection", id] as const,
};
