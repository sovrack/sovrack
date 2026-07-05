import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Server, ServerLogLevel } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ServersCryptoService } from '../../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../../adapters/ssh/server-host-key.service';
import { ServersConnectionService } from '../../servers/services/servers-connection.service';
import {
  AnsibleRunnerService,
  type AnsibleLogEvent as CoreAnsibleLogEvent,
} from '../../../../adapters/provisioning/ansible-runner.service';
import type { PreparationRoleKey } from '../../servers/shared/server-preparation-options';
import { assertSafeLinuxUsername } from '../../servers/shared/servers-shell.util';

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
 * Matériel TLS client rapatrié par le rôle docker_tls (contenu PEM en clair,
 * EN MÉMOIRE uniquement — jamais loggé, jamais écrit dans le dépôt). Consommé
 * immédiatement par l'orchestrateur pour enregistrer la DockerConnection
 * (chiffrée au repos par DockerConnectionsService, comme une saisie manuelle).
 */
export type DockerTlsMaterial = {
  ca: string;
  cert: string;
  key: string;
};

export type RunPreparationResult = {
  /** Présent uniquement si le rôle docker_tls a tourné ET a rapatrié les certs. */
  dockerTls: DockerTlsMaterial | null;
};

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
  ): Promise<RunPreparationResult> {
    assertSafeLinuxUsername(server.username);
    if (input.roles.length === 0) {
      throw new BadRequestException(
        'Au moins une option de setup doit être sélectionnée.',
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

    // docker_tls : répertoire temporaire sécurisé (mkdtemp, HORS du dépôt —
    // jamais committable) où le rôle rapatrie les 3 PEM client. Lu puis détruit
    // dans le finally, même en cas d'échec du run. Le contenu ne transite
    // jamais par stdout → jamais dans les logs de préparation.
    const wantsDockerTls = input.roles.includes('docker_tls');
    const tlsFetchDir = wantsDockerTls
      ? await mkdtemp(join(tmpdir(), 'docker-tls-'))
      : null;

    try {
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
            ...(tlsFetchDir
              ? {
                  docker_tls_fetch_dir: tlsFetchDir,
                  // SAN du cert serveur = l'adresse par laquelle la plateforme
                  // joint réellement ce serveur (Server.host).
                  docker_tls_san_ip: server.host,
                }
              : {}),
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

      return { dockerTls: await this.readDockerTlsMaterial(tlsFetchDir) };
    } finally {
      if (tlsFetchDir) {
        await rm(tlsFetchDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /** Lit les 3 PEM rapatriés par le rôle docker_tls ; null si absents. */
  private async readDockerTlsMaterial(
    tlsFetchDir: string | null,
  ): Promise<DockerTlsMaterial | null> {
    if (!tlsFetchDir) return null;
    try {
      const [ca, cert, key] = await Promise.all([
        readFile(join(tlsFetchDir, 'ca.pem'), 'utf-8'),
        readFile(join(tlsFetchDir, 'cert.pem'), 'utf-8'),
        readFile(join(tlsFetchDir, 'key.pem'), 'utf-8'),
      ]);
      if (!ca.trim() || !cert.trim() || !key.trim()) return null;
      return { ca, cert, key };
    } catch (error) {
      // Run réussi mais certs absents (ex. rôle sauté) → l'orchestrateur
      // logguera l'absence ; l'enregistrement manuel reste possible.
      this.logger.warn(
        `docker_tls: client certs not found in fetch dir: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
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
