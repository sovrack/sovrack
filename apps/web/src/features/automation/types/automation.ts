export type AutomationActionCategory =
  | 'system'
  | 'docker'
  | 'web'
  | 'database'
  | 'security'
  | 'monitoring'
  | 'ci';

export type AutomationAction = {
  key: string;
  label: string;
  description: string;
  playbookPath: string;
  category: AutomationActionCategory;
  roles?: string[];
  requiresSshValidated: boolean;
  requiresSudo: boolean;
};

export type AutomationRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELED'
  | 'TIMEOUT';

export type AutomationTargetStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED'
  | 'TIMEOUT';

export type AutomationRunTarget = {
  id: string;
  runId: string;
  serverId: string;
  status: AutomationTargetStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  server: {
    id: string;
    name: string;
    host: string;
  };
};

export type AutomationRunLog = {
  id: string;
  runId: string;
  serverId?: string | null;
  level: 'INFO' | 'WARNING' | 'ERROR';
  source: string;
  message: string;
  lineNumber: number;
  createdAt: string;
};

export type AutomationRun = {
  id: string;
  actionKey: string;
  actionLabel: string;
  status: AutomationRunStatus;
  summary?: string | null;
  errorMessage?: string | null;
  extraVarsJson?: Record<string, unknown> | null;
  requestedById?: string | null;
  requestedBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  targets: AutomationRunTarget[];
  logs: AutomationRunLog[];
};

export type AutomationRunsListResponse = {
  items: AutomationRun[];
  total: number;
  page: number;
  pageSize: number;
};

// Kept manual: the UI treats action keys as dynamic strings (loaded from the
// backend at runtime), whereas the contract types `actionKey` as a strict enum
// → deriving would create impedance with the dynamic action list. Intentional.
export type CreateAutomationRunPayload = {
  actionKey: string;
  serverIds: string[];
  gitlabRunnerExecutor?: string;
};
