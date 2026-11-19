// LogLine/LogLevel moved to shared/types/log-line.ts (see Sprints 4+5+6
// mission, B10) — shared/common/log-terminal.tsx needed to stop depending
// on this feature. Import directly from @/shared/types/log-line.
import type { LogLevel } from "@/shared/types/log-line";

export type DeploymentLogEvent = {
  deploymentId: string;
  message: string;
  timestamp: string;
  level?: LogLevel;
};

export type DeploymentLogReplayEvent = {
  deploymentId: string;
  logs: DeploymentLogEvent[];
};
