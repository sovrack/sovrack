import type { Server, ServerJob, ServerJobStatus, ServerJobType } from '@prisma/client';
import type { PaginatedResult } from '../../../core/http/pagination.dto';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

/** Minimal view of the currently active (RUNNING/PENDING/BLOCKED) job for a server. */
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
};

export type CreateServerResult = ServerPublic & {
  agentBootstrapToken?: string;
};

export type ServerJobPublic = Omit<ServerJob, 'payload'>;

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
