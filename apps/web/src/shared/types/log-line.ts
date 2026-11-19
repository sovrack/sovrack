// Moved from features/deployments/types/logs.ts (see Sprints 4+5+6 mission,
// B10): shared/common/log-terminal.tsx renders LogLine[] and must stay a
// leaf component with zero business-feature dependency.
export type LogLevel = "info" | "error" | "success";

export type LogLine = {
  timestamp: string;
  message: string;
  level: LogLevel;
  isReplayed?: boolean;
};
