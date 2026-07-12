"use client";

// Barrel — the server hooks were split into focused modules (CRUD, validation,
// capabilities, setup). This re-export preserves the original import path
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
  useDockerConnection,
  useServerSetups,
  useStartServerSetup,
  useSetup,
  useSetupReadiness,
  useSetupLogs,
  useRetrySetup,
  useCancelSetup,
} from "./use-server-setup";
