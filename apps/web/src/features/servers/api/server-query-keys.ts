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
  detail: (id: string) => [...serverKeys.all, "detail", id] as const,
  preparationOptions: () => [...serverKeys.all, "preparation-options"] as const,
  preparation: (id: string) => [...serverKeys.all, "preparation", id] as const,
  capabilities: (id: string) =>
    [...serverKeys.all, "capabilities", id] as const,
  installedTools: (id: string) =>
    [...serverKeys.all, "installed-tools", id] as const,
  preparations: (id: string) =>
    [...serverKeys.all, "preparations", id] as const,
  preparationReadiness: (id: string) =>
    [...serverKeys.all, "preparation-readiness", id] as const,
  validationResults: (id: string) =>
    [...serverKeys.all, "validation-results", id] as const,
  preparationLogs: (id: string) =>
    [...serverKeys.all, "preparation-logs", id] as const,
  auditEvents: (id: string) => [...serverKeys.all, "audit-events", id] as const,
};
