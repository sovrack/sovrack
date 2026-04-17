import type { Server, ServerJob } from '@prisma/client';
import { ServerConnectionModeDto } from './dto/create-server.dto';

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

export type InstallToolsDto = {
  docker?: boolean;
  ansible?: boolean;
  runner?: boolean;
};

export type RegisterRunnerPayload = {
  gitlabUrl: string;
};
