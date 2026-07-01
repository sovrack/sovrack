import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContainerStatus, Deployment, DeploymentStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  SSH_EXECUTOR,
  type ISshExecutor,
  type SshConnection,
} from '../../../adapters/ssh/ports/ssh-executor.port';
import { SshConnectionPoolService } from '../../../adapters/ssh/ssh-connection-pool.service';
import { ServersCryptoService } from '../../../adapters/ssh/servers-crypto.service';
import { ServerHostKeyService } from '../../../adapters/ssh/server-host-key.service';
import { DockerSshService } from '../../../adapters/container-runtime/docker-ssh.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import { DeployRoutingService } from './deploy-routing.service';
import { toJson } from '../../../shared/utils/prisma-json.util';

const COMPOSE_POLL_INTERVAL_MS = 5_000;
const COMPOSE_TIMEOUT_MS = 5 * 60_000;
const WORK_DIR_BASE = '/opt/platform/compose';

/**
 * Executes Docker Compose deployments over SSH.
 *
 * Writes the user's docker-compose.yml (and an optional Traefik override) to
 * the target server, runs `docker compose up`, polls until all services are
 * running, registers the containers in the database, and applies the Traefik
 * route. On failure it runs `docker compose down` to leave no orphans.
 */
@Injectable()
export class DockerComposeExecutorService {
  private readonly logger = new Logger(DockerComposeExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SSH_EXECUTOR) private readonly ssh: ISshExecutor,
    private readonly sshPool: SshConnectionPoolService,
    private readonly serversCrypto: ServersCryptoService,
    private readonly serverHostKey: ServerHostKeyService,
    private readonly dockerSsh: DockerSshService,
    private readonly logEmitter: DeploymentLogEmitter,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly notifications: NotificationsService,
    private readonly deployRouting: DeployRoutingService,
  ) {}

  async executeDeploy(deploymentId: string): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: { select: { id: true, name: true } },
        service: {
          select: {
            id: true,
            name: true,
            type: true,
            dockerComposeContent: true,
            composeServiceName: true,
            port: true,
          },
        },
        serviceEnv: {
          select: {
            id: true,
            serverId: true,
            environment: {
              select: {
                id: true,
                name: true,
                servers: {
                  where: { isActive: true, isVerified: true },
                  select: { id: true, name: true, host: true },
                },
              },
            },
          },
        },
        user: { select: { id: true, email: true } },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    if (!deployment.serviceEnvId) {
      throw new BadRequestException(
        `Déploiement ${deployment.id} sans serviceEnvId — exécution impossible.`,
      );
    }

    const composeContent = deployment.service?.dockerComposeContent;
    if (!composeContent) {
      throw new BadRequestException(
        'Le service n\'a pas de contenu docker-compose. Renseignez le champ "Docker Compose" du service.',
      );
    }

    // ── Resolve server ────────────────────────────────────────────────────────
    const servers = deployment.serviceEnv?.environment.servers ?? [];
    const resolvedRefs = deployment.resolvedRefs as {
      serverId?: string;
    } | null;
    const serverId =
      deployment.serviceEnv?.serverId ??
      servers[0]?.id ??
      resolvedRefs?.serverId;
    if (!serverId) {
      const envName = deployment.serviceEnv?.environment?.name ?? '?';
      throw new BadRequestException(
        `Aucun serveur actif lié à l'environnement « ${envName} ». Liez un serveur dans Projet → Environments.`,
      );
    }

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) throw new BadRequestException('Serveur cible introuvable');
    if (!server.isVerified)
      throw new BadRequestException('Serveur non vérifié');

    const svcEnvId = deployment.serviceEnvId;
    const composeServiceName = deployment.service?.composeServiceName ?? null;
    const projectName = `platform-compose-${svcEnvId.slice(0, 8)}`;

    // ── Mark RUNNING ──────────────────────────────────────────────────────────
    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: `${deployment.logs ?? ''}\nDéploiement Docker Compose en cours...`.trim(),
      },
    });
    this.gateway.emitStatus({
      deploymentId: deployment.id,
      status: DeploymentStatus.RUNNING,
    });

    let conn: SshConnection | null = null;
    let commandLogs = '';

    try {
      // ── SSH connection ────────────────────────────────────────────────────
      const decryptedKey = this.serversCrypto.decrypt(server.sshKey);
      const pinnedHost = await this.serverHostKey.resolveForConnection(server, {
        allowTrustOnFirstUse: false,
      });
      conn = await this.sshPool.acquire({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedKey,
        expectedHostKey: pinnedHost.keyBase64,
        readyTimeoutMs: 10_000,
      });

      // ── Write compose files to VPS ────────────────────────────────────────
      const workDir = `${WORK_DIR_BASE}/${svcEnvId}`;
      const composePath = `${workDir}/docker-compose.yml`;
      this.emitLog(
        deploymentId,
        `Écriture du fichier compose dans ${workDir}…`,
        'info',
      );
      await this.ssh.putContent(conn, composePath, composeContent);
      commandLogs += `compose.yml écrit → ${workDir}\n`;

      // ── Traefik domain resolution ─────────────────────────────────────────
      const serviceName = deployment.service?.name ?? deployment.project.name;
      const { traefikDomain, traefikServiceEnvId, useTraefik } =
        await this.deployRouting.resolveTraefikConfig(
          {
            project: deployment.project,
            service: deployment.service,
            serviceEnv: deployment.serviceEnv
              ? {
                  id: deployment.serviceEnv.id,
                  environment: deployment.serviceEnv.environment,
                }
              : null,
          },
          servers,
          serviceName,
        );

      // ── docker compose up ─────────────────────────────────────────────────
      this.emitLog(deploymentId, 'Lancement de docker compose up…', 'info');
      const upResult = await this.dockerSsh.composeUp(conn, projectName, [
        composePath,
      ]);
      if (upResult.code !== 0) {
        throw new Error(
          `docker compose up a échoué (exit ${String(upResult.code)}): ${upResult.stderr || upResult.stdout}`,
        );
      }
      commandLogs += `docker compose up OK\n`;
      if (upResult.stdout.trim()) commandLogs += upResult.stdout.trim() + '\n';

      // ── Poll until all services are running ───────────────────────────────
      this.emitLog(
        deploymentId,
        'Attente du démarrage des services compose…',
        'info',
      );
      const deadline = Date.now() + COMPOSE_TIMEOUT_MS;
      let composeServices: Array<{ Name: string; State: string; ID: string }> =
        [];
      while (Date.now() < deadline) {
        composeServices = await this.dockerSsh.composePs(conn, projectName);
        if (
          composeServices.length > 0 &&
          composeServices.every((s) => s.State === 'running')
        ) {
          break;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, COMPOSE_POLL_INTERVAL_MS),
        );
      }

      const unhealthy = composeServices.filter((s) => s.State !== 'running');
      if (composeServices.length === 0 || unhealthy.length > 0) {
        const names = unhealthy.map((s) => `${s.Name}(${s.State})`).join(', ');
        throw new Error(
          `Services compose non démarrés après ${String(COMPOSE_TIMEOUT_MS / 1000)}s: ${names || '(aucun service détecté)'}`,
        );
      }
      commandLogs += `${String(composeServices.length)} service(s) compose en cours d'exécution.\n`;

      // ── Register containers in DB ─────────────────────────────────────────
      for (const svc of composeServices) {
        await this.prisma.container.create({
          data: {
            dockerId: svc.ID,
            name: svc.Name,
            imageRef: deployment.dockerImage ?? 'compose',
            status: ContainerStatus.RUNNING,
            deploymentId: deployment.id,
            serverId,
            serviceId: deployment.service?.id ?? null,
            serviceEnvId: svcEnvId,
            lastSeenAt: new Date(),
          },
        });
      }
      commandLogs += `${String(composeServices.length)} conteneur(s) enregistrés en base.\n`;

      // ── Apply Traefik route for the exposed service ───────────────────────
      if (
        useTraefik &&
        traefikDomain &&
        traefikServiceEnvId &&
        composeServiceName
      ) {
        // Find the container that matches the declared compose service name.
        const exposed = composeServices.find((s) =>
          s.Name.includes(composeServiceName),
        );
        if (exposed) {
          commandLogs += await this.deployRouting.applyRoute({
            deploymentId: deployment.id,
            serverId,
            server,
            serviceEnvId: traefikServiceEnvId,
            traefikDomain,
            containerNames: [exposed.Name],
            servicePort: deployment.service?.port ?? 3000,
          });
        }
      }

      // ── SUCCESS ───────────────────────────────────────────────────────────
      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          conditions: toJson([
            {
              type: 'Ready',
              status: 'True',
              reason: 'ComposeDeploySucceeded',
              message: 'Docker Compose déployé avec succès.',
              lastTransitionAt: new Date().toISOString(),
            },
          ]),
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}`.trim(),
        },
      });

      // Retire les containers de l'ancienne release (évite les fantômes RUNNING en UI).
      const prevSvcEnv = await this.prisma.serviceEnvironment.findUnique({
        where: { id: svcEnvId },
        select: { currentDeploymentId: true },
      });
      const prevDeploymentId = prevSvcEnv?.currentDeploymentId;

      await this.prisma.serviceEnvironment.update({
        where: { id: svcEnvId },
        data: { currentDeploymentId: finished.id },
      });

      if (prevDeploymentId && prevDeploymentId !== finished.id) {
        await this.prisma.container.updateMany({
          where: { deploymentId: prevDeploymentId },
          data: { status: ContainerStatus.EXITED },
        });
      }

      this.gateway.emitStatus({
        deploymentId: finished.id,
        status: finished.status,
      });
      this.gateway.emitFinished({
        deploymentId: finished.id,
        status: finished.status,
        finishedAt: finished.finishedAt,
      });

      void this.notifications
        .notifyDeploymentFinished({
          deploymentId: finished.id,
          status: 'SUCCESS',
          projectName: deployment.project.name,
          environmentName: deployment.serviceEnv?.environment?.name ?? '',
          branch: deployment.branch ?? '',
          triggeredBy: deployment.user?.email ?? 'auto',
        })
        .catch(() => undefined);

      return finished;
    } catch (error) {
      // ── Failure: tear down compose project ───────────────────────────────
      if (conn) {
        await this.dockerSsh
          .composeDown(conn, projectName)
          .catch((e: unknown) =>
            this.logger.warn(
              `composeDown on failure: ${e instanceof Error ? e.message : 'unknown'}`,
            ),
          );
      }

      const message =
        error instanceof Error ? error.message : 'Échec du déploiement Compose';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          conditions: toJson([
            {
              type: 'Degraded',
              status: 'False',
              reason: 'ComposeFailed',
              message,
              lastTransitionAt: new Date().toISOString(),
            },
          ]),
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}\n${message}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: failed.id,
        status: failed.status,
      });
      this.gateway.emitFinished({
        deploymentId: failed.id,
        status: failed.status,
        finishedAt: failed.finishedAt,
      });

      void this.notifications
        .notifyDeploymentFinished({
          deploymentId: failed.id,
          status: 'FAILED',
          projectName: deployment.project.name,
          environmentName: deployment.serviceEnv?.environment?.name ?? '',
          branch: deployment.branch ?? '',
          triggeredBy: deployment.user?.email ?? 'auto',
        })
        .catch(() => undefined);

      throw new BadRequestException('Déploiement Compose échoué');
    } finally {
      await conn?.dispose();
    }
  }

  /**
   * Tear down a compose stack for a given ServiceEnvironment.
   * Used by cancel() to properly stop a compose deployment (respects
   * restart policies — individual stopContainer does not).
   */
  async teardownComposeStack(serviceEnvId: string): Promise<void> {
    const projectName = `platform-compose-${serviceEnvId.slice(0, 8)}`;

    const svcEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: {
        serverId: true,
        environment: {
          select: {
            servers: {
              where: { isActive: true, isVerified: true },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });

    const serverId = svcEnv?.serverId ?? svcEnv?.environment.servers[0]?.id;
    if (!serverId) return;

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) return;

    const decryptedKey = this.serversCrypto.decrypt(server.sshKey);
    const pinnedHost = await this.serverHostKey.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    const conn = await this.sshPool.acquire({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: decryptedKey,
      expectedHostKey: pinnedHost.keyBase64,
      readyTimeoutMs: 10_000,
    });
    try {
      await this.dockerSsh.composeDown(conn, projectName);
    } finally {
      await conn.dispose();
    }
  }

  private emitLog(
    deploymentId: string,
    message: string,
    level: 'info' | 'error',
  ): void {
    this.logEmitter.emit(deploymentId, message, level);
  }
}
