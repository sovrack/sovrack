import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContainerStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DeploymentsHealthcheckService } from '../health/deployments-healthcheck.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';

/**
 * Étapes pré/post-lancement du conteneur d'un déploiement :
 *  - commande pre-deploy (migrations…) dans un conteneur jetable, échec = stop ;
 *  - health-gate après démarrage (mode Traefik = juste « running » ; sinon
 *    checks post-deploy), avec arrêt du conteneur défaillant en cas d'échec.
 *
 * Extrait de DockerDeployExecutorService pour isoler ces gardes de l'orchestration.
 */
@Injectable()
export class DeploymentPrelaunchService {
  private readonly logger = new Logger(DeploymentPrelaunchService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly healthcheckService: DeploymentsHealthcheckService,
    private readonly logEmitter: DeploymentLogEmitter,
  ) {}

  /** Run the optional pre-deploy command in a throwaway container; throw on failure. */
  async runPreDeployCommand(
    serverId: string,
    imageRef: string,
    containerName: string,
    envVars: string[],
    preCmd: string,
    preTimeout: number,
    deploymentId: string,
  ): Promise<string> {
    this.logEmitter.emit(
      deploymentId,
      `[PRE-DEPLOY] Running: ${preCmd}`,
      'info',
    );
    const preContainer = await this.docker.createContainer(serverId, {
      Image: imageRef,
      name: `pre-${containerName}`,
      Env: envVars,
      HostConfig: { AutoRemove: true },
      Cmd: ['sh', '-c', preCmd],
    });
    await this.docker.startContainer(serverId, preContainer.id);
    // Poll until the pre-deploy container exits.
    const exitCode = await this.waitForContainerExit(
      serverId,
      preContainer.id,
      preTimeout,
    );
    if (exitCode !== 0) {
      throw new BadRequestException(
        `Pre-deploy command failed with exit code ${String(exitCode)}: ${preCmd}`,
      );
    }
    this.logEmitter.emit(
      deploymentId,
      `[PRE-DEPLOY] Completed successfully.`,
      'info',
    );
    return `[PRE-DEPLOY] Completed successfully.\n`;
  }

  /**
   * Confirm the new container is healthy. Traefik mode (no host port): just
   * verify it's running. Otherwise run the post-deploy health checks. On
   * failure, stop the broken container (so it doesn't linger RUNNING) and
   * rethrow so the caller marks the deploy FAILED.
   */
  async runHealthGate(params: {
    serverId: string;
    containerId: string;
    serverHost: string;
    publishPort: number;
    useTraefik: boolean;
    healthcheckPath: string | null;
    deploymentId: string;
  }): Promise<string> {
    const {
      serverId,
      containerId,
      serverHost,
      publishPort,
      useTraefik,
      healthcheckPath,
      deploymentId,
    } = params;
    try {
      if (useTraefik) {
        // Mode Traefik : pas de port hôte → on vérifie que le conteneur tourne
        // (Traefik effectue le vrai routage/santé via 'web'). Petite attente
        // anti-flap avant l'inspection.
        await this.sleep(3000);
        const info = await this.docker.inspectContainer(serverId, containerId);
        if (info.State.Status !== 'running') {
          throw new BadRequestException(
            `Conteneur non démarré (état: ${info.State.Status})`,
          );
        }
        return `Conteneur en cours d'exécution (mode Traefik, sans port hôte).\n`;
      }
      const healthLogs =
        await this.healthcheckService.runPostDeployHealthChecks({
          deploymentId,
          environmentDomain: null,
          serviceDomain: null,
          serverHost,
          serverId,
          appPort: publishPort,
          healthcheckPath,
        });
      return `${healthLogs}\n`;
    } catch (healthError) {
      this.logEmitter.emit(
        deploymentId,
        'Health-check échoué : arrêt du conteneur défaillant.',
        'error',
      );
      await this.docker
        .stopContainer(serverId, containerId)
        .catch((stopErr: unknown) => {
          this.logger.warn(
            `Could not stop unhealthy container ${containerId}: ${stopErr instanceof Error ? stopErr.message : 'unknown'}`,
          );
        });
      await this.prisma.container
        .updateMany({
          where: { dockerId: containerId },
          data: { status: ContainerStatus.EXITED },
        })
        .catch(() => undefined);
      throw healthError;
    }
  }

  /**
   * Poll Docker inspect until the given container has exited, then return the
   * exit code. Times out after `timeoutSec` seconds and returns -1.
   */
  private async waitForContainerExit(
    serverId: string,
    containerId: string,
    timeoutSec: number,
  ): Promise<number> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      try {
        const info = await this.docker.inspectContainer(serverId, containerId);
        if (info.State.Status === 'exited' || info.State.Status === 'dead') {
          return info.State.ExitCode ?? -1;
        }
      } catch {
        return -1;
      }
      await new Promise<void>((r) => setTimeout(r, 2000));
    }
    return -1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
