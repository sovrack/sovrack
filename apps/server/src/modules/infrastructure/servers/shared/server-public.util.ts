import { Server, ServerConnectionMode } from '@prisma/client';
import { ServerConnectionModeDto } from '../dto/create-server.dto';
import {
  serverHasDocker,
  serverHasRunner,
} from '../../../../adapters/server-capabilities/server-capabilities.util';
import type { ServerActiveJob, ServerPublic } from './servers.types';

export function toConnectionModeDto(
  _mode: ServerConnectionMode,
): ServerConnectionModeDto {
  // `ServerConnectionMode` n'a qu'une valeur (SSH) : la plateforme est 100 %
  // agentless. Le paramètre reste pour garder la signature stable si un autre
  // mode est ajouté un jour (on remplacera alors par un vrai switch exhaustif).
  return ServerConnectionModeDto.SSH;
}

export function toPublicServer(
  server: Server,
  activeJob: ServerActiveJob | null = null,
): ServerPublic {
  const { sshKey, ...publicServer } = server;
  void sshKey;
  return {
    ...publicServer,
    hasDocker: serverHasDocker(server),
    hasRunner: serverHasRunner(server),
    connectionMode: toConnectionModeDto(server.connectionMode),
    activeJob,
  };
}
