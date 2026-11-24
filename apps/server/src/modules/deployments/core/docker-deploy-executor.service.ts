import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Deployment, DeploymentStatus, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AgentTunnelService } from '../../infrastructure/servers/agent-tunnel.service';
import {
  buildContainerPrefix,
  buildServiceAlias,
  buildDeployautomationLabels,
} from '../../../shared/utils/container-spec.util';
import { getDatabaseContainerConfig } from '../../../shared/utils/database-spec.util';
import type { IDockerRuntime } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DOCKER_RUNTIME } from '../../../adapters/container-runtime/ports/docker-runtime.port';
import { DeployRoutingService } from './deploy-routing.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { ImageResolverService } from './image-resolver.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentEnvService } from './deployment-env.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  ReplicaLauncherService,
  type ResolvedRuntimeConfig,
} from './replica-launcher.service';
import { DeployFailureRecoveryService } from './deploy-failure-recovery.service';
import {
  conditionsToJson,
  dockerDeployProgressingCondition,
  dockerDeploySuccessConditions,
} from '../utils/deployment-conditions.util';
import {
  getLogContext,
  runWithLogContext,
  setLogContext,
} from '../../../shared/logger/log-context';
import { randomUUID } from 'crypto';
import {
  resolvePortAssignment,
  resolveRuntimeConfig,
  buildDeploymentNotificationContext,
  type RuntimeConfigInput,
} from './deployment-executor-utils';
import { dockerDeployInclude } from './docker-deploy-query';

@Injectable()
export class DockerDeployExecutorService {
  private readonly logger = new Logger(DockerDeployExecutorService.name);

  // Green container publishes on canonical+offset until blue-green cutover.
  private static readonly BLUE_GREEN_DRAIN_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCKER_RUNTIME) private readonly docker: IDockerRuntime,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly prelaunch: DeploymentPrelaunchService,
    private readonly imageResolver: ImageResolverService,
    private readonly logEmitter: DeploymentLogEmitter,
    private readonly deploymentEnv: DeploymentEnvService,
    private readonly deployRouting: DeployRoutingService,
    private readonly containerLifecycle: ContainerLifecycleService,
    private readonly notifications: NotificationsService,
    private readonly replicaLauncher: ReplicaLauncherService,
    private readonly failureRecovery: DeployFailureRecoveryService,
    @Optional() private readonly agentTunnel?: AgentTunnelService,
  ) {}

  private resolveRuntimeConfig(
    deployment: RuntimeConfigInput,
  ): ResolvedRuntimeConfig {
    return resolveRuntimeConfig(deployment);
  }

  async executeDeploy(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    return runWithLogContext(
      {
        correlationId: getLogContext().correlationId ?? randomUUID(),
        deploymentId,
      },
      () => this.executeDeployInternal(deploymentId, overrideImage),
    );
  }

  private async executeDeployInternal(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: dockerDeployInclude,
    });

    if (!deployment) throw new NotFoundException('Déploiement non trouvé');

    // Exécution native de la stack Docker Compose
    if (deployment.service?.buildPack === 'DOCKER_COMPOSE') {
      await this.deployDockerCompose(deployment);
      return (await this.prisma.deployment.findUnique({
        where: { id: deployment.id },
      }))!;
    }

    // Null serviceEnvId = archived ServiceEnvironment; cannot bind cell.
    if (!deployment.serviceEnvId) {
      throw new BadRequestException(
        `Déploiement ${deployment.id} sans serviceEnvId (son ServiceEnvironment a peut-être été archivé). Exécution impossible.`,
      );
    }
    setLogContext({
      serviceEnvId: deployment.serviceEnv?.id,
      userId: deployment.user?.id,
    });

    // Resolve target server: ServiceEnvironment.serverId > first env server > legacy resolvedRefs.
    const servers = deployment.serviceEnv?.environment.servers ?? [];
    const resolvedRefs = deployment.resolvedRefs as {
      serverId?: string;
    } | null;
    const serverId =
      deployment.serviceEnv?.serverId ??
      servers[0]?.id ??
      resolvedRefs?.serverId;
    if (!serverId) {
      const envName =
        deployment.serviceEnv?.environment?.name ?? 'cet environnement';
      throw new BadRequestException(
        `Aucun serveur actif et vérifié n'est rattaché à l'environnement « ${envName} ». ` +
          `Allez dans Projet → Environments et liez un serveur (le serveur doit être actif et vérifié).`,
      );
    }

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) throw new BadRequestException('Serveur cible introuvable');
    if (!server.isVerified)
      throw new BadRequestException('Serveur non vérifié');

    const serviceName = deployment.service?.name ?? deployment.project.name;
    const containerPrefix = buildContainerPrefix(
      deployment.project.name,
      serviceName,
    );
    const containerName = `${containerPrefix}${deployment.id.slice(0, 8)}`;
    const serviceAlias = buildServiceAlias(serviceName);
    const runtime = this.resolveRuntimeConfig(deployment);
    let servicePort = runtime.port;
    const autoDbEnv =
      await this.deploymentEnv.resolveAutoWiredDbEnv(deployment);
    const {
      envVars,
      envResolution,
      commandLogs: envLogs,
    } = this.deploymentEnv.resolveDeploymentEnv(deployment, autoDbEnv);
    let commandLogs = envLogs;
    const {
      dbVolumeName,
      dbVolumePath,
      commandLogs: dbLogs,
    } = await this.deploymentEnv.setupDbVolume(
      deployment,
      serverId,
      envVars,
      servicePort,
    );
    commandLogs += dbLogs;
    if (dbVolumePath) {
      const dbConfig = getDatabaseContainerConfig(
        deployment.service!.databaseType!,
      );
      servicePort = dbConfig.port;
    }

    const { traefikDomain, traefikServiceEnvId, useTraefik } =
      await this.deployRouting.resolveTraefikConfig(
        deployment,
        servers,
        serviceName,
      );

    // Inject PORT for PaaS convention (non-DATABASE, not user-defined).
    if (
      deployment.service?.type !== ServiceType.DATABASE &&
      !envVars.some((e) => e.startsWith('PORT='))
    ) {
      envVars.push(`PORT=${String(servicePort)}`);
    }

    const {
      blueGreen,
      publishPort,
      dbHostPortDisabled,
      canOverlap,
      publishesHostPort,
    } = resolvePortAssignment({
      strategy: deployment.strategy,
      serviceType: deployment.service!.type,
      useTraefik,
      servicePort,
      dbExternalPort: deployment.service?.externalPort ?? null,
    });
    if (blueGreen) {
      this.logEmitter.emit(
        deployment.id,
        `[BLUE-GREEN] Conteneur green sur le port ${publishPort} (blue reste actif).`,
        'info',
      );
      commandLogs += `[BLUE-GREEN] Green publié sur ${publishPort}\n`;
    }

    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        conditions: conditionsToJson(
          dockerDeployProgressingCondition('Déploiement Docker en cours.'),
        ),
        logs: `${deployment.logs ?? ''}\nDéploiement Docker en cours...`.trim(),
      },
    });

    let stoppedOld: Array<{ id: string; name: string }> = [];
    const newContainerIds: string[] = [];

    try {
      const isLocalBuild = !!deployment.build?.isLocalBuild;
      const imageRef = this.imageResolver.resolveImageRef(
        deployment,
        overrideImage,
        serverId,
      );
      commandLogs += `Image résolue : ${imageRef}\n`;

      commandLogs += await this.imageResolver.buildOrPullImage(
        deployment,
        imageRef,
        isLocalBuild,
        server,
        serverId,
        envResolution.entries
          .filter((e) => !e.isSecret)
          .map((e) => `${e.key}=${e.value}`),
        envResolution.entries
          .filter((e) => e.isSecret)
          .map((e) => `${e.key}=${e.value}`),
        Boolean(overrideImage),
      );

      // Stop old containers first unless Traefik/blue-green allows overlap.
      commandLogs += await this.containerLifecycle.assertNoForeignPortConflict(
        serverId,
        containerPrefix,
        publishPort,
        publishesHostPort,
      );
      const oldContainers = await this.containerLifecycle.listServiceContainers(
        serverId,
        containerPrefix,
      );
      stoppedOld = canOverlap ? [] : oldContainers;
      if (stoppedOld.length > 0) {
        commandLogs += await this.containerLifecycle.stopContainers(
          serverId,
          stoppedOld,
          deployment.id,
        );
      }

      // ── Pre-deploy command ──────────────────────────────────────────────
      if (deployment.service?.preDeployCommand) {
        commandLogs += await this.prelaunch.runPreDeployCommand(
          serverId,
          imageRef,
          containerName,
          envVars,
          deployment.service.preDeployCommand,
          deployment.service.preDeployTimeout ?? 120,
          deployment.id,
        );
      }

      const projectNetwork = `project-${deployment.project.id}`;
      try {
        await this.docker.createNetwork(serverId, projectNetwork);
        commandLogs += `Network ${projectNetwork} ready.\n`;
      } catch {
        // Network already exists — nothing to do.
      }

      // ── Resolve app volumes ─────────────────────────────────────────────
      const appVolumes = deployment.service?.volumes ?? [];
      const appBinds: string[] = appVolumes
        .filter((v): v is { name: string; mountPath: string } => !!v.mountPath)
        .map((v) => `${v.name}:${v.mountPath}`);

      const replicas = runtime.replicas;

      // Multiple APPLICATION replicas require Traefik.
      if (
        replicas > 1 &&
        !useTraefik &&
        deployment.service?.type === ServiceType.APPLICATION
      ) {
        throw new BadRequestException(
          'Les répliques (>1) pour un service APPLICATION nécessitent Traefik. ' +
            'Sans Traefik, le port hôte ne peut pas être partagé entre N conteneurs. ' +
            'Configurez un domaine ou activez Traefik pour ce service.',
        );
      }

      this.logEmitter.emit(
        deployment.id,
        replicas > 1
          ? `Création de ${String(replicas)} répliques...`
          : 'Création du conteneur...',
        'info',
      );
      const stopTimeout = deployment.service?.shutdownTimeout ?? 30;
      const deployautomationLabels = buildDeployautomationLabels({
        projectId: deployment.project.id,
        projectName: deployment.project.name,
        serviceId: deployment.service?.id,
        serviceName,
        environmentName:
          deployment.serviceEnv?.environment?.name ??
          deployment.environment?.name ??
          '',
        serviceEnvId: deployment.serviceEnv?.id,
        deploymentId: deployment.id,
      });

      const { replicaContainerNames, logs: replicaLogs } =
        await this.replicaLauncher.launchReplicas({
          serverId,
          server,
          deploymentId: deployment.id,
          serviceId: deployment.service?.id,
          serviceEnvId: deployment.serviceEnv?.id,
          serviceType: deployment.service?.type,
          containerName,
          serviceAlias,
          replicas,
          imageRef,
          runtime,
          envVars,
          servicePort,
          publishPort,
          useTraefik,
          dbHostPortDisabled,
          deployautomationLabels,
          dbVolumeName,
          dbVolumePath,
          appBinds,
          projectNetwork,
          stopTimeout,
          newContainerIds,
        });
      commandLogs += replicaLogs;

      if (useTraefik && traefikDomain && traefikServiceEnvId) {
        commandLogs += await this.deployRouting.applyRoute({
          deploymentId: deployment.id,
          serverId,
          server,
          serviceEnvId: traefikServiceEnvId,
          traefikDomain,
          containerNames: replicaContainerNames,
          servicePort,
        });
      }

      if (blueGreen) {
        // For blue-green, cut over using the first (primary) replica's ID.
        const greenDockerId = newContainerIds[0] ?? '';
        commandLogs += await this.deployRouting.cutoverBlueGreen({
          serviceEnvId: deployment.serviceEnv?.id ?? null,
          serverId,
          greenDockerId,
          publishPort,
        });
      }

      const toRetire = blueGreen ? stoppedOld : oldContainers;
      if (toRetire.length > 0) {
        commandLogs += await this.containerLifecycle.removeContainers(
          serverId,
          toRetire,
          deployment.id,
        );
      }

      const digestResult = await this.imageResolver.resolveImageDigest(
        serverId,
        imageRef,
      );
      if (!digestResult.ok) {
        this.logger.warn(
          `Digest non résolu pour ${imageRef}: ${digestResult.error}`,
        );
      }
      const imageDigest = digestResult.ok ? digestResult.value : null;

      void this.docker.pruneDanglingImages(serverId);

      // Set current deployment pointer + status in a single transaction.
      const finished = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.deployment.update({
          where: { id: deployment.id },
          data: {
            status: DeploymentStatus.SUCCESS,
            dockerImage: imageRef,
            imageSha: imageDigest ?? deployment.imageSha,
            conditions: conditionsToJson(
              dockerDeploySuccessConditions(envResolution.warnings),
            ),
            finishedAt: new Date(),
            logs: `${deployment.logs ?? ''}\n${commandLogs}`.trim(),
          },
        });

        if (updated.serviceEnvId) {
          await tx.serviceEnvironment.update({
            where: { id: updated.serviceEnvId },
            data: { currentDeploymentId: updated.id },
          });
        }

        return updated;
      });

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
          ...buildDeploymentNotificationContext(deployment),
        })
        .catch(() => undefined);

      return finished;
    } catch (error) {
      return this.failureRecovery.handleDeployFailure({
        serverId,
        deploymentId: deployment.id,
        priorLogs: deployment.logs,
        commandLogs,
        newContainerIds,
        stoppedOld,
        ...buildDeploymentNotificationContext(deployment),
        error,
      });
    }
  }

  private async deployDockerCompose(deployment: any): Promise<void> {
    const composeContent = deployment.service?.dockerComposeContent;
    if (!composeContent || !composeContent.trim()) {
      throw new BadRequestException("Le service n'a pas de contenu docker-compose.yml.");
    }

    const serviceName = deployment.service?.name ?? deployment.project?.name ?? 'app';
    const projectNameStr = deployment.project?.name ?? 'project';

    const servers = deployment.serviceEnv?.environment?.servers ?? [];
    const serverId = deployment.serviceEnv?.serverId ?? servers[0]?.id;
    if (!serverId) {
      throw new BadRequestException(
        "Aucun serveur actif n'est assigné à cet environnement pour exécuter docker compose.",
      );
    }

    this.logEmitter.emit(
      deployment.id,
      `🚀 Initialisation du déploiement Docker Compose pour « ${serviceName} »...\n`,
      'info',
    );

    const safeProj = projectNameStr.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const safeSvc = serviceName.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const composeDir = `/srv/sovrack/apps/${safeProj}/${safeSvc}`;
    const composeFile = `${composeDir}/docker-compose.yml`;
    const projectName = `${safeProj}-${safeSvc}`;

    const b64 = Buffer.from(composeContent, 'utf8').toString('base64');
    const cmd = `mkdir -p ${composeDir} && echo "${b64}" | base64 -d > ${composeFile} && docker compose -p ${projectName} -f ${composeFile} up -d --remove-orphans`;

    this.logEmitter.emit(
      deployment.id,
      `📦 Écriture de la recette dans ${composeFile} et démarrage des conteneurs...\n`,
      'info',
    );

    let output = '';
    let success = false;
    if (this.agentTunnel && this.agentTunnel.isAgentConnected(serverId)) {
      try {
        const res = await this.agentTunnel.executeCommand(serverId, cmd, [], {}, 180);
        output = (res.stdout || '') + '\n' + (res.stderr || '');
        success = res.exitCode === 0;
      } catch (err) {
        output = `Erreur Agent Tunnel: ${(err as Error).message}`;
      }
    } else {
      output = `Avertissement: Agent Sovrack non connecté sur le serveur ${serverId}. Veuillez démarrer l'Agent Sovrack sur le serveur hôte.`;
      success = false;
    }

    this.logEmitter.emit(deployment.id, output, success ? 'info' : 'error');

    if (!success) {
      await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          logs: output.slice(0, 5000),
          finishedAt: new Date(),
        },
      });
      throw new BadRequestException(`Échec du déploiement Docker Compose:\n${output}`);
    }

    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.SUCCESS,
        finishedAt: new Date(),
      },
    });

    this.logEmitter.emit(
      deployment.id,
      `✅ Stack Docker Compose « ${projectName} » démarrée avec succès !\n`,
      'info',
    );
  }
}
