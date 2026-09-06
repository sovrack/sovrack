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
      HostConfig: {
        AutoRemove: true,
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'],
        PidsLimit: 128,
        Init: true,
      },
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
    /** DATABASE without externalPort → no host port to HTTP-probe (Task 4). */
    dbHostPortDisabled?: boolean;
    healthcheckPath: string | null;
    deploymentId: string;
  }): Promise<string> {
    const {
      serverId,
      containerId,
      serverHost,
      publishPort,
      useTraefik,
      dbHostPortDisabled,
      healthcheckPath,
      deploymentId,
    } = params;
    try {
      // Aucun port hôte publié (mode Traefik, ou base DATABASE interne sans
      // externalPort) → pas d'endpoint HTTP à sonder : la seule preuve de santé
      // est que le conteneur reste STABLE (D7). On ne se contente plus d'une
      // inspection unique à +3 s (un conteneur qui crash-loope APRÈS était
      // marqué SUCCESS à tort) : on vérifie la stabilité sur une fenêtre.
      if (useTraefik || dbHostPortDisabled) {
        await this.assertStableRunning(serverId, containerId);
        return dbHostPortDisabled
          ? `Conteneur stable (base interne, sans port hôte publié).\n`
          : `Conteneur stable (mode Traefik, sans port hôte).\n`;
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
      // D7 : même après une sonde HTTP verte, le conteneur peut crash-looper
      // ensuite — on confirme la stabilité (RestartCount inchangé) avant SUCCESS.
      await this.assertStableRunning(serverId, containerId);
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

  /**
   * D7 (mission finale) : un déploiement n'est SUCCESS que si le conteneur
   * reste RUNNING et ne redémarre pas (RestartCount stable) sur une courte
   * fenêtre — attrape les crash-loops qui démarrent après la sonde initiale
   * (observés en réel : frontend .ts en boucle, backend sans DATABASE_URL).
   * Fenêtre configurable via DEPLOY_STABILITY_WINDOW_MS (défaut 12 s, 3
   * échantillons). Lève BadRequestException si instable → le caller stoppe le
   * conteneur et marque FAILED.
   */
  private async assertStableRunning(
    serverId: string,
    containerId: string,
  ): Promise<void> {
    const windowMs = this.stabilityWindowMs();
    const samples = 3;
    const interval = Math.max(1000, Math.floor(windowMs / samples));
    let baselineRestart: number | null = null;
    for (let i = 0; i < samples; i += 1) {
      if (i > 0) await this.sleep(interval);
      const info = await this.docker.inspectContainer(serverId, containerId);
      if (info.State?.Status !== 'running') {
        throw new BadRequestException(
          `Conteneur instable après démarrage (état: ${info.State?.Status ?? 'inconnu'}).`,
        );
      }
      const restart = info.RestartCount ?? 0;
      if (baselineRestart === null) {
        baselineRestart = restart;
      } else if (restart > baselineRestart) {
        throw new BadRequestException(
          `Conteneur en crash-loop (RestartCount ${baselineRestart}→${restart}) : déploiement instable.`,
        );
      }
    }
  }

  private stabilityWindowMs(): number {
    const raw = Number(process.env.DEPLOY_STABILITY_WINDOW_MS);
    return Number.isFinite(raw) && raw >= 3000 ? raw : 12000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
