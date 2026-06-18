import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Server, ServerLogLevel } from '@prisma/client';
import { join } from 'path';
import { ServersCryptoService } from '../../servers/services/servers-crypto.service';
import { ServerHostKeyService } from '../../servers/services/server-host-key.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import {
  AnsibleRunnerService,
  type AnsibleLogEvent as CoreAnsibleLogEvent,
} from '../../../../core/provisioning/ansible-runner.service';
import type { PreparationRoleKey } from '../../servers/shared/server-preparation-options';
import { assertSafeLinuxUsername } from '../../servers/shared/servers-shell.utils';

type AnsibleLogEvent = {
  level: ServerLogLevel;
  source: 'stdout' | 'stderr';
  message: string;
};

export type RunPreparationInput = {
  roles: PreparationRoleKey[];
  selectedOptions: Record<string, boolean>;
  gitlabRunnerExecutor: string;
  reinstallOptions?: string[];
};

export type RunPreparationCallbacks = {
  onLog?: (event: AnsibleLogEvent) => Promise<void> | void;
};

type RunOptions = {
  signal: AbortSignal;
  timeoutMs: number;
};

export type RunPreparationOptions = RunOptions;

/**
 * Server preparation Ansible service.
 *
 * Owns the preparation-specific concerns (host-key trust, passwordless-sudo
 * pre-flight, the `prepare-server.yml` extra-vars contract) and delegates the
 * actual ansible-playbook spawn to the single, shared {@link AnsibleRunnerService}
 * in core/. No ansible spawning lives here.
 */
@Injectable()
export class ServerPreparationAnsibleService {
  private readonly logger = new Logger(ServerPreparationAnsibleService.name);

  constructor(
    private readonly crypto: ServersCryptoService,
    private readonly hostKeys: ServerHostKeyService,
    private readonly ssh: ServersConnectionService,
    private readonly ansibleRunner: AnsibleRunnerService,
  ) {}

  async runPreparation(
    server: Server,
    input: RunPreparationInput,
    options: RunPreparationOptions,
    callbacks?: RunPreparationCallbacks,
  ): Promise<void> {
    assertSafeLinuxUsername(server.username);
    if (input.roles.length === 0) {
      throw new BadRequestException(
        'Au moins une option de préparation doit être sélectionnée.',
      );
    }

    await this.hostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    await this.ssh.assertPasswordlessSudo(server);

    const playbookPath = join(
      this.ansibleRunner.resolvePlaybooksRoot(),
      'prepare-server.yml',
    );
    const privateKey = this.crypto.normalizePrivateKeyFormat(
      this.crypto.decrypt(server.sshKey),
    );

    await this.ansibleRunner.run(
      {
        serverId: server.id,
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey,
        playbookPath,
        extraVars: {
          selected_roles: input.roles,
          preparation_options: input.selectedOptions,
          gitlab_runner_executor: input.gitlabRunnerExecutor,
          reinstall_options: input.reinstallOptions ?? [],
          managed_by: 'internal-devops-platform-control-node',
        },
        strictHostKeyChecking: this.hostKeys.resolveStrictHostKeyChecking(),
        knownHostsPath: this.hostKeys.resolveKnownHostsPath(),
      },
      options,
      callbacks?.onLog
        ? {
            onLog: (event: CoreAnsibleLogEvent) =>
              callbacks.onLog?.({
                level: this.mapLevel(event.level),
                source: event.source,
                message: event.message,
              }),
          }
        : undefined,
    );
  }

  private mapLevel(level: CoreAnsibleLogEvent['level']): ServerLogLevel {
    switch (level) {
      case 'error':
        return ServerLogLevel.ERROR;
      case 'warning':
        return ServerLogLevel.WARNING;
      default:
        return ServerLogLevel.INFO;
    }
  }
}
