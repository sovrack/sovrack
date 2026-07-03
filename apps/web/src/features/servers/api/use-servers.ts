"use client";

// Barrel — the server hooks were split into focused modules (CRUD, validation,
// capabilities, preparation). This re-export preserves the original import path
// `@/features/servers/api/use-servers` for existing consumers.
export { serverKeys } from "./server-query-keys";
export {
  useServers,
  useServer,
  useServersReachability,
  useCreateServer,
  useUpdateServer,
} from "./use-server-crud";
export {
  useValidateServerSsh,
  useDetectServerInfo,
  useServerValidationResults,
  useServerAuditEvents,
} from "./use-server-validation";
export {
  useServerCapabilities,
  useInstalledTools,
} from "./use-server-capabilities";
export {
  useServerPreparations,
  useStartServerPreparation,
  useServerPreparationOptions,
  usePreparation,
  usePreparationReadiness,
  usePreparationLogs,
  useRetryPreparation,
  useCancelPreparation,
} from "./use-server-preparation";
