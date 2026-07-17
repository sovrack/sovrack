import { Inject, Injectable } from '@nestjs/common';
import { ContainerStatus, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { buildContainerCreateSpec } from '../utils/container-create-spec.util';

/** Runtime config actually applied to the container. */
export interface ResolvedRuntimeConfig {
  port: number;
  startCommand: string | null;
  healthcheckPath: string | null;
  cpuLimit: number | null;
  memLimitMb: number | null;
  replicas: number;
}

/** Params for the N-replica launch loop, extracted from DockerDeployExecutorService. */
export interface ReplicaLaunchParams {
  serverId: string;
  server: { host: string };
  deploymentId: string;
  serviceId: string | null | undefined;
  serviceEnvId: string | null | undefined;
  serviceType: ServiceType | null | undefined;
  containerName: string;
  serviceAlias: string;
  replicas: number;
  imageRef: string;
  runtime: ResolvedRuntimeConfig;
  envVars: string[];
  servicePort: number;
  publishPort: number;
  useTraefik: boolean;
  /** DATABASE service without externalPort → no host port published (Task 4). */
  dbHostPortDisabled?: boolean;
  deployautomationLabels: Record<string, string>;
  dbVolumeName: string | null | undefined;
  dbVolumePath: string | null | undefined;
  appBinds: string[];
  projectNetwork: string;
  stopTimeout: number;
  /** Pass-by-reference: populated during the loop so the caller's catch block
   *  can clean up containers created before a mid-loop failure. */
  newContainerIds: string[];
}

export interface ReplicaLaunchResult {
  replicaContainerNames: string[];
  logs: string;
}

/**
 * Crée et démarre N répliques, enregistre chacune en base, vérifie le health.
 * Extrait de DockerDeployExecutorService — voir
 * EXPLORATION_BACKEND_DEPENDANCES.md section 3. `newContainerIds` est passé
 * par référence afin que le catch block de l'appelant (executeDeployInternal)
 * puisse nettoyer les conteneurs créés avant un échec partiel.
 */
@Injectable()
export class ReplicaLauncherService {
  constructor(
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly prisma: PrismaService,
    private readonly prelaunch: DeploymentPrelaunchService,
    private readonly logEmitter: DeploymentLogEmitter,
  ) {}

  async launchReplicas(p: ReplicaLaunchParams): Promise<ReplicaLaunchResult> {
    const replicaContainerNames: string[] = [];
    let logs = '';

    for (let i = 0; i < p.replicas; i++) {
      const replicaName =
        p.replicas === 1
          ? p.containerName
          : `${p.containerName}-${String(i + 1)}`;
      const replicaAlias =
        p.replicas === 1
          ? p.serviceAlias
          : `${p.serviceAlias}-${String(i + 1)}`;

      const container = await this.docker.createContainer(
        p.serverId,
        buildContainerCreateSpec({
          imageRef: p.imageRef,
          containerName: replicaName,
          labels: p.deployautomationLabels,
          envVars: p.envVars,
          servicePort: p.servicePort,
          publishPort: p.publishPort,
          useTraefik: p.useTraefik,
          dbHostPortDisabled: p.dbHostPortDisabled,
          serviceType: p.serviceType ?? undefined,
          startCommand: p.runtime.startCommand,
          stopTimeout: p.stopTimeout,
          binds: [
            ...(p.dbVolumeName && p.dbVolumePath
              ? [`${p.dbVolumeName}:${p.dbVolumePath}`]
              : []),
            ...p.appBinds,
          ],
          networkMode: p.projectNetwork,
          networkAlias: replicaAlias,
          resourceLimits: {
            cpuLimit: p.runtime.cpuLimit,
            memLimitMb: p.runtime.memLimitMb,
          },
        }),
      );
      p.newContainerIds.push(container.id);
      logs += `Réplique ${String(i + 1)}/${String(p.replicas)} créée : ${container.id.slice(0, 12)}\n`;

      this.logEmitter.emit(
        p.deploymentId,
        `Démarrage réplique ${String(i + 1)}…`,
        'info',
      );
      await this.docker.startContainer(p.serverId, container.id);
      logs += `Réplique ${String(i + 1)} démarrée\n`;

      await this.prisma.container.create({
        data: {
          dockerId: container.id,
          name: replicaName,
          imageRef: p.imageRef,
          status: ContainerStatus.RUNNING,
          deploymentId: p.deploymentId,
          serverId: p.serverId,
          serviceId: p.serviceId ?? null,
          serviceEnvId: p.serviceEnvId ?? null,
          lastSeenAt: new Date(),
        },
      });

      logs += await this.prelaunch.runHealthGate({
        serverId: p.serverId,
        containerId: container.id,
        serverHost: p.server.host,
        publishPort: p.publishPort,
        useTraefik: p.useTraefik,
        dbHostPortDisabled: p.dbHostPortDisabled,
        healthcheckPath: p.runtime.healthcheckPath,
        deploymentId: p.deploymentId,
      });

      replicaContainerNames.push(replicaName);
    }
    logs += `${String(p.replicas)} réplique(s) enregistrée(s) en base.\n`;

    return { replicaContainerNames, logs };
  }
}
