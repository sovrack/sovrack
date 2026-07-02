// Extracted from notifications.service.ts: NotificationsSmtpService and
// NotificationsSlackService only need these as types, but importing them from
// notifications.service.ts (which itself imports both channel services)
// created a static circular dependency (flagged by arch:check/dependency-cruiser
// even though the imports are type-only and erased at runtime). A leaf types
// file with no dependencies of its own breaks the cycle.

export type DeploymentNotificationPayload = {
  deploymentId: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELED';
  projectName: string;
  environmentName: string;
  branch: string;
  triggeredBy: string;
  pipelineUrl?: string | null;
};

export type DockerConnectionDownPayload = {
  serverId: string;
  serverName?: string;
  endpoint: string;
  lastError: string;
  failedSince: Date;
};

export type DockerConnectionRecoveredPayload = {
  serverId: string;
  serverName?: string;
  endpoint: string;
};
