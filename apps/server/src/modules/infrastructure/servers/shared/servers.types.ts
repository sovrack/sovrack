import type {
  Server,
  ServerJob,
  ServerJobStatus,
  ServerJobType,
} from '@prisma/client';
import type { PaginatedResult } from '../../../../shared/http/pagination.dto';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

/** Minimal view of the currently active (RUNNING/PENDING) job for a server. */
export type ServerActiveJob = {
  id: string;
  type: ServerJobType;
  status: ServerJobStatus;
  startedAt: Date | null;
  createdAt: Date;
  error: string | null;
};

export type ServerPublic = Omit<
  Server,
  'sshKey' | 'bastionSshKey' | 'agentTokenHash' | 'connectionMode'
> & {
  connectionMode: ServerConnectionModeDto;
  activeJob?: ServerActiveJob | null;
  // Derived from `capabilities` (the hasDocker/hasRunner columns were removed);
  // computed in ServersCoreService.toPublic.
  hasDocker: boolean;
  hasRunner: boolean;
};

export type CreateServerResult = ServerPublic & {
  agentBootstrapToken?: string;
};

// A2 (merge the separate "Logs" dialog into Job History): PREPARE_SERVER jobs
// store the ServerRun (kind=PREPARATION) they triggered as
// `payload.setupId` — the only part of `payload` a client legitimately
// needs, to fetch that run's step-by-step Ansible log. The rest of `payload`
// (selectedOptions/resolvedRoles/retryOfSetupId) is internal
// bookkeeping and stays stripped, same as before.
export type ServerJobPublic = Omit<ServerJob, 'payload'> & {
  setupId: string | null;
};

export type ServerExecutionOptions = {
  signal: AbortSignal;
  timeoutMs: number;
};

export type ServerListResult = ServerPublic[] | PaginatedResult<ServerPublic>;

export type ServerJobsListResult =
  | ServerJobPublic[]
  | PaginatedResult<ServerJobPublic>;

export type RegisterRunnerPayload = {
  gitlabUrl: string;
};
