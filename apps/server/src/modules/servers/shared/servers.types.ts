import type { Server, ServerJob } from '@prisma/client';
import type { PaginatedResult } from '../../../core/http/pagination.dto';
import { ServerConnectionModeDto } from '../dto/create-server.dto';

export type ServerPublic = Omit<
  Server,
  'sshKey' | 'bastionSshKey' | 'agentTokenHash' | 'connectionMode'
> & {
  connectionMode: ServerConnectionModeDto;
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
