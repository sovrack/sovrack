import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ContainerStatus,
  Deployment,
  DeploymentStatus,
  DeploymentStrategy,
  Prisma,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  buildContainerPrefix,
  buildServiceAlias,
  buildplatformLabels,
} from '../../../shared/utils/container-spec.util';
import { getDatabaseContainerConfig } from '../../../shared/utils/database-spec.util';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { TraefikRouteService } from './traefik-route.service';
import { DeployRoutingService } from './deploy-routing.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { ImageResolverService } from './image-resolver.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentEnvService } from './deployment-env.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { buildContainerCreateSpec } from '../utils/container-create-spec.util';
import { toJson } from '../../../shared/utils/prisma-json.util';
import {
  getLogContext,
  runWithLogContext,
  setLogContext,
} from '../../../shared/logger/log-context';
import { randomUUID } from 'crypto';

/** Subset of Deployment.specSnapshot the executor consumes (see deployments-create). */
interface RuntimeSpecSnapshot {
  port?: number | null;
  startCommand?: string | null;
  healthcheckPath?: string | null;
  cpuLimit?: number | null;
  memLimitMb?: number | null;
}

/** Runtime config actually applied to the container. */
interface ResolvedRuntimeConfig {
  port: number;
  startCommand: string | null;
  healthcheckPath: string | null;
  cpuLimit: number | null;
  memLimitMb: number | null;
}

@Injectable()
export class DockerDeployExecutorService {
  private readonly logger = new Logger(DockerDeployExecutorService.name);

  // Blue-green: the green container publishes on canonical+offset so it can run
  // alongside the live (blue) container until it is verified healthy.
  private static readonly BLUE_GREEN_PORT_OFFSET = 1;
  private static readonly BLUE_GREEN_DRAIN_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly prelaunch: DeploymentPrelaunchService,
    private readonly traefik: TraefikRouteService,
    private readonly imageResolver: ImageResolverService,
    private readonly logEmitter: DeploymentLogEmitter,
    private readonly deploymentEnv: DeploymentEnvService,
    private readonly deployRouting: DeployRoutingService,
    private readonly containerLifecycle: ContainerLifecycleService,
  ) {}

  /**
   * Resolve the runtime config to apply to the container.
   *
   * For a ROLLBACK or AUTO-HEAL deployment we prefer the FROZEN specSnapshot
   * captured at the original deploy (true point-in-time restore: same port,
   * start command, healthcheck and resource limits as the release being
   * restored), falling back to live config field-by-field if the snapshot is
   * missing a value. A normal deploy has no snapshot yet, so it uses live
   * config unchanged — behaviour identical to before this method existed.
   *
   * Env vars are deliberately NOT taken from the snapshot: secrets must never be
   * stored there, so env always comes from live config (resolveDeploymentEnv).
   */
  private resolveRuntimeConfig(deployment: {
    isRollback: boolean;
    isAutoHealed: boolean;
    specSnapshot: Prisma.JsonValue;
    service: {
      port: number | null;
      startCommand: string | null;
      healthcheckPath: string | null;
      cpuLimit: number | null;
      memLimitMb: number | null;
    } | null;
  }): ResolvedRuntimeConfig {
    const usePinned =
      (deployment.isRollback || deployment.isAutoHealed) &&
      deployment.specSnapshot != null &&
      typeof deployment.specSnapshot === 'object' &&
      !Array.isArray(deployment.specSnapshot);
    const snap = usePinned
      ? (deployment.specSnapshot as RuntimeSpecSnapshot)
      : null;
    const service = deployment.service;
    return {
      port: snap?.port ?? service?.port ?? 3000,
      startCommand: snap?.startCommand ?? service?.startCommand ?? null,
      healthcheckPath:
        snap?.healthcheckPath ?? service?.healthcheckPath ?? null,
      cpuLimit: snap?.cpuLimit ?? service?.cpuLimit ?? null,
      memLimitMb: snap?.memLimitMb ?? service?.memLimitMb ?? null,
    };
  }

  private buildConditions(
    type: 'Progressing' | 'Ready' | 'Degraded',
    reason: string,
    message: string,
  ): Prisma.InputJsonValue {
    return [
      {
        type,
        status: type === 'Degraded' ? 'False' : 'True',
        reason,
        message,
        lastTransitionAt: new Date().toISOString(),
      },
    ];
  }

  async executeDeploy(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    // Establish (or inherit) a logging context so every line emitted during the
    // deploy carries the correlationId + deploymentId for end-to-end tracing.
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
      include: {
        project: { select: { id: true, name: true } },
        service: {
          select: {
            id: true,
            name: true,
            port: true,
            env: true,
            secretsEnv: true,
            dockerComposeContent: true,
            repoPath: true,
            branch: true,
            startCommand: true,
            type: true,
            databaseType: true,
            databaseVersion: true,
            databaseCredentials: true,
            healthcheckPath: true,
            cpuLimit: true,
            memLimitMb: true,
            preDeployCommand: true,
            preDeployTimeout: true,
            shutdownTimeout: true,
            buildPack: true,
            dockerfile: true,
            nixpacksConfig: true,
            staticConfig: true,
            rootDir: true,
            volumes: { select: { name: true, mountPath: true } },
            provider: { select: { providerUrl: true, adminToken: true } },
          },
        },
        serviceEnv: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                env: true,
                secretsEnv: true,
                servers: {
                  where: { isActive: true, isVerified: true },
                  select: { id: true, name: true, host: true },
                },
              },
            },
          },
        },
        environment: {
          select: { id: true, name: true, env: true, secretsEnv: true },
        },
        user: { select: { id: true, email: true, fullName: true, role: true } },
        build: {
          select: {
            id: true,
            imageSha: true,
            buildPack: true,
            isLocalBuild: true,
          },
        },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    // serviceEnvId is nullable in the schema only to preserve history when a
    // ServiceEnvironment is archived (onDelete: SetNull). Every live path sets
    // it; a null here is a malformed/legacy row that cannot bind to a cell —
    // fail fast rather than deploy something that can't move the
    // currentDeployment pointer or be reconciled/auto-healed.
    if (!deployment.serviceEnvId) {
      throw new BadRequestException(
        `Déploiement ${deployment.id} sans serviceEnvId (son ServiceEnvironment a peut-être été archivé). Exécution impossible.`,
      );
    }
    setLogContext({
      serviceEnvId: deployment.serviceEnv?.id,
      userId: deployment.user?.id,
    });

    // Résoudre le serveur cible, par ordre de priorité :
    //  1) ServiceEnvironment.serverId (cible EXPLICITE — découplage serveur↔env :
    //     un service choisit son serveur, un VPS peut héberger plusieurs envs),
    //  2) le 1er serveur de l'environnement (comportement historique),
    //  3) resolvedRefs.serverId (lignes legacy).
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
    // Alias DNS stable (= nom du service) : joignable par les autres conteneurs
    // du projet via un nom fixe, indépendant de l'ID de déploiement.
    const serviceAlias = buildServiceAlias(serviceName);
    // Rollback/auto-heal restore the frozen specSnapshot config; normal deploys
    // use live config (unchanged behaviour). See resolveRuntimeConfig.
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

    const blueGreen =
      deployment.strategy === DeploymentStrategy.BLUE_GREEN &&
      deployment.service?.type !== ServiceType.DATABASE &&
      !useTraefik;
    const publishPort = blueGreen
      ? servicePort + DockerDeployExecutorService.BLUE_GREEN_PORT_OFFSET
      : servicePort;
    if (blueGreen) {
      this.emitGatewayLog(
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
        conditions: this.buildConditions(
          'Progressing',
          'DockerDeploy',
          'Déploiement Docker en cours.',
        ),
        logs: `${deployment.logs ?? ''}\nDéploiement Docker en cours...`.trim(),
      },
    });

    // Tracked across try/catch so a failed deploy can roll the service back to
    // the previous container(s) it had to stop (see the catch block).
    let stoppedOld: Array<{ id: string; name: string }> = [];
    let newContainerId: string | null = null;

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
        // Vars non-secrètes → build-args (ex. NEXT_PUBLIC_* figées au build).
        envResolution.entries
          .filter((e) => !e.isSecret)
          .map((e) => `${e.key}=${e.value}`),
        // Secrets → BuildKit --secret (jamais en build-arg : pas de fuite image).
        envResolution.entries
          .filter((e) => e.isSecret)
          .map((e) => `${e.key}=${e.value}`),
        // Image épinglée (rollback / redeploy d'une image précise) → réutiliser
        // l'image locale existante au lieu de rebuild. Un deploy frais (sans
        // override) reconstruit toujours.
        Boolean(overrideImage),
      );

      const publishesHostPort =
        !useTraefik &&
        deployment.service?.type !== 'WORKER' &&
        deployment.service?.type !== 'CRON';

      // Start-before-stop (Coolify/Railway/Dokploy parity). The new container
      // can run alongside the old one only when it won't collide on a host port:
      //  - Traefik mode  → the container publishes no host port,
      //  - blue-green    → the green publishes on an offset port.
      // In those modes the OLD container keeps serving until the new one is
      // healthy, then it is retired → true zero-downtime. Otherwise we must stop
      // the old one first to free the port, but we remember it so a FAILED
      // deploy brings it back (automatic recovery — never leave the service down).
      const canOverlap = useTraefik || blueGreen;
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

      // ── Ensure per-project Docker network exists ────────────────────────
      const projectNetwork = `project-${deployment.project.id}`;
      try {
        await this.docker.createNetwork(serverId, projectNetwork);
        commandLogs += `Network ${projectNetwork} ready.\n`;
      } catch {
        // Network may already exist — not an error.
      }

      // ── Resolve app volumes ─────────────────────────────────────────────
      const appVolumes = deployment.service?.volumes ?? [];
      const appBinds: string[] = appVolumes
        .filter((v): v is { name: string; mountPath: string } => !!v.mountPath)
        .map((v) => `${v.name}:${v.mountPath}`);

      this.emitGatewayLog(deployment.id, 'Création du conteneur...', 'info');
      const stopTimeout = deployment.service?.shutdownTimeout ?? 30;
      // Labels Docker → exposés par cAdvisor (container_label_platform_*) pour
      // filtrer le monitoring par projet / service / environnement / déploiement.
      const platformLabels = buildplatformLabels({
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

      const container = await this.docker.createContainer(
        serverId,
        buildContainerCreateSpec({
          imageRef,
          containerName,
          labels: platformLabels,
          envVars,
          servicePort,
          publishPort,
          useTraefik,
          serviceType: deployment.service?.type,
          startCommand: runtime.startCommand,
          stopTimeout,
          binds: [
            ...(dbVolumeName && dbVolumePath
              ? [`${dbVolumeName}:${dbVolumePath}`]
              : []),
            ...appBinds,
          ],
          networkMode: projectNetwork,
          networkAlias: serviceAlias,
          resourceLimits: {
            cpuLimit: runtime.cpuLimit,
            memLimitMb: runtime.memLimitMb,
          },
        }),
      );
      newContainerId = container.id;
      commandLogs += `Conteneur créé : ${container.id.slice(0, 12)}\n`;

      this.emitGatewayLog(deployment.id, 'Démarrage du conteneur...', 'info');
      await this.docker.startContainer(serverId, container.id);
      commandLogs += 'Conteneur démarré\n';

      await this.prisma.container.create({
        data: {
          dockerId: container.id,
          name: containerName,
          imageRef,
          status: ContainerStatus.RUNNING,
          deploymentId: deployment.id,
          serverId,
          serviceId: deployment.service?.id ?? null,
          serviceEnvId: deployment.serviceEnv?.id ?? null,
          lastSeenAt: new Date(),
        },
      });
      commandLogs += 'Enregistrement du conteneur en base de données\n';

      commandLogs += await this.prelaunch.runHealthGate({
        serverId,
        containerId: container.id,
        serverHost: server.host,
        publishPort,
        useTraefik,
        healthcheckPath: runtime.healthcheckPath,
        deploymentId: deployment.id,
      });

      if (useTraefik && traefikDomain && traefikServiceEnvId) {
        commandLogs += await this.deployRouting.applyRoute({
          deploymentId: deployment.id,
          serverId,
          server,
          serviceEnvId: traefikServiceEnvId,
          traefikDomain,
          containerName,
          servicePort,
        });
      }

      if (blueGreen) {
        commandLogs += await this.deployRouting.cutoverBlueGreen({
          serviceEnvId: deployment.serviceEnv?.id ?? null,
          serverId,
          greenDockerId: container.id,
          publishPort,
        });
      }

      // New container healthy and serving → NOW retire the previous one(s).
      // Blue-green retires the still-running blue inside cutoverBlueGreen, so
      // here we only clean up the container(s) we had to stop up front.
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
      // Result<string,string> : on garde le fallback ET on logge la raison.
      if (!digestResult.ok) {
        this.logger.warn(
          `Digest non résolu pour ${imageRef}: ${digestResult.error}`,
        );
      }
      const imageDigest = digestResult.ok ? digestResult.value : null;

      // Nettoyage best-effort des images orphelines (anciens builds) → évite que
      // le disque du VPS se remplisse au fil des déploiements. Non bloquant.
      void this.docker.pruneDanglingImages(serverId);

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage: imageRef,
          imageSha: imageDigest ?? deployment.imageSha,
          conditions: this.buildSuccessConditions(envResolution.warnings),
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}`.trim(),
        },
      });

      // Pointeur "release courante" (L3) : ce déploiement devient LE live de sa
      // cellule. Source unique du "live" (fin de l'heuristique "dernier SUCCESS
      // deviné par date") — couvre déploiement normal, rollback ET pipeline CI,
      // qui passent tous par ici. Rollback = ce pointeur se déplace atomiquement.
      if (finished.serviceEnvId) {
        await this.prisma.serviceEnvironment.update({
          where: { id: finished.serviceEnvId },
          data: { currentDeploymentId: finished.id },
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

      return finished;
    } catch (error) {
      // Automatic recovery: remove the half-deployed new container and bring
      // back any previous container(s) we had to stop, so a FAILED deploy never
      // leaves the service down (Dokploy-style auto-rollback on failure).
      if (newContainerId) {
        await this.docker
          .removeContainer(serverId, newContainerId, true)
          .catch(() => undefined);
      }
      if (stoppedOld.length > 0) {
        commandLogs += await this.containerLifecycle
          .restartContainers(serverId, stoppedOld, deployment.id)
          .catch(() => '');
      }

      const message =
        error instanceof Error ? error.message : 'Échec du déploiement Docker';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          conditions: this.buildConditions('Degraded', 'DeployFailed', message),
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

      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Déploiement Docker échoué');
    }
  }

  // ─── Deploy phases (extracted from executeDeployInternal) ────────────────────

  /** Run the optional pre-deploy command in a throwaway container; throw on failure. */
  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { resolvedRefs: true },
    });
    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    const refs = deployment.resolvedRefs as {
      serverId?: string;
      containerName?: string;
    } | null;
    if (!refs?.serverId) throw new BadRequestException('Aucun serveur cible');
    const serverId = refs.serverId;
    const containers = await this.docker.listContainers(serverId, true);
    for (const c of containers) {
      if (refs.containerName && c.Names?.includes(`/${refs.containerName}`)) {
        const logs: string[] = [];
        for await (const chunk of this.docker.streamContainerLogs(
          serverId,
          c.Id,
          { follow: false, tail },
        )) {
          logs.push(chunk.line);
        }
        return logs.join('\n');
      }
    }
    return '';
  }

  emitGatewayLog(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    this.logEmitter.emit(deploymentId, rawMessage, fallbackLevel);
  }

  /**
   * Ready condition for a successful deploy, plus a non-blocking EnvWarning
   * condition when some env/secret level could not be resolved.
   */
  private buildSuccessConditions(envWarnings: string[]): Prisma.InputJsonValue {
    const now = new Date().toISOString();
    const conditions: Array<Record<string, string>> = [
      {
        type: 'Ready',
        status: 'True',
        reason: 'DeploySucceeded',
        message: 'Déploiement Docker réussi.',
        lastTransitionAt: now,
      },
    ];
    if (envWarnings.length > 0) {
      conditions.push({
        type: 'EnvWarning',
        status: 'True',
        reason: 'EnvUnresolved',
        message:
          `Variables d'environnement non résolues: ${envWarnings.join('; ')}`.slice(
            0,
            1000,
          ),
        lastTransitionAt: now,
      });
    }
    return toJson(conditions);
  }
}
