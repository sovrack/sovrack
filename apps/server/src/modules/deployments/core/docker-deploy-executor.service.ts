import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
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
import { DeployRoutingService } from './deploy-routing.service';
import { ContainerLifecycleService } from './container-lifecycle.service';
import { ImageResolverService } from './image-resolver.service';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';
import { DeploymentEnvService } from './deployment-env.service';
import { DeploymentPrelaunchService } from './deployment-prelaunch.service';
import { DeploymentEventsPublisher } from '../events/deployment-events.publisher';
import { NotificationsService } from '../../notifications/notifications.service';
import { BLUE_GREEN_PORT_OFFSET } from '../utils/blue-green.constants';
import { DockerComposeExecutorService } from './docker-compose-executor.service';
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

/** Subset of Deployment.specSnapshot the executor consumes (see deployments-create). */
interface RuntimeSpecSnapshot {
  port?: number | null;
  startCommand?: string | null;
  healthcheckPath?: string | null;
  cpuLimit?: number | null;
  memLimitMb?: number | null;
  replicas?: number | null;
}

@Injectable()
export class DockerDeployExecutorService {
  private readonly logger = new Logger(DockerDeployExecutorService.name);

  // Blue-green: the green container publishes on canonical+offset so it can run
  // alongside the live (blue) container until it is verified healthy. Offset
  // shared with DeploymentPreflightService (see blue-green.constants.ts).
  private static readonly BLUE_GREEN_DRAIN_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly gateway: DeploymentEventsPublisher,
    private readonly prelaunch: DeploymentPrelaunchService,
    private readonly imageResolver: ImageResolverService,
    private readonly logEmitter: DeploymentLogEmitter,
    private readonly deploymentEnv: DeploymentEnvService,
    private readonly deployRouting: DeployRoutingService,
    private readonly containerLifecycle: ContainerLifecycleService,
    private readonly notifications: NotificationsService,
    private readonly composeExecutor: DockerComposeExecutorService,
    private readonly replicaLauncher: ReplicaLauncherService,
    private readonly failureRecovery: DeployFailureRecoveryService,
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
   *
   * NB: la précédence snapshot→service→défaut 3000 est un point de
   * synchronisation avec DeploymentPreflightService (voir
   * EXPLORATION_BACKEND_DEPENDANCES.md section 3) — ne pas modifier sans
   * mettre à jour le pré-vol en parallèle.
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
      replicas?: number | null;
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
      replicas: snap?.replicas ?? service?.replicas ?? 1,
    };
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
            replicas: true,
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

    if (!deployment) throw new NotFoundException('Déploiement non trouvé');

    // Docker Compose deployments follow a completely different path (SSH + compose CLI).
    if (deployment.service?.buildPack === 'DOCKER_COMPOSE') {
      return this.composeExecutor.executeDeploy(deploymentId);
    }

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
      ? servicePort + BLUE_GREEN_PORT_OFFSET
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
        conditions: conditionsToJson(
          dockerDeployProgressingCondition('Déploiement Docker en cours.'),
        ),
        logs: `${deployment.logs ?? ''}\nDéploiement Docker en cours...`.trim(),
      },
    });

    // Tracked across try/catch so a failed deploy can roll the service back to
    // the previous container(s) it had to stop (see the catch block).
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

      // NB: cette règle est dupliquée volontairement dans
      // DeploymentPreflightService (Point 9) — voir
      // EXPLORATION_BACKEND_DEPENDANCES.md section 3. Ne pas changer d'un
      // côté sans l'autre.
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
      // NB: DeploymentPreflightService appelle la MÊME méthode en pré-flight
      // (défense en profondeur voulue, voir Point 9 du sprint de validation
      // pré-déploiement) — ne pas retirer ce garde-fou ici.
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

      const replicas = runtime.replicas;

      // Guard: multiple replicas of APPLICATION services require Traefik.
      // WORKER/CRON never publish a host port, so they can scale freely.
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

      this.emitGatewayLog(
        deployment.id,
        replicas > 1
          ? `Création de ${String(replicas)} répliques...`
          : 'Création du conteneur...',
        'info',
      );
      const stopTimeout = deployment.service?.shutdownTimeout ?? 30;
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
          platformLabels,
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

      // Pointeur "release courante" (L3) : ce déploiement devient LE live de sa
      // cellule. Source unique du "live" (fin de l'heuristique "dernier SUCCESS
      // deviné par date") — couvre déploiement normal, rollback ET pipeline CI,
      // qui passent tous par ici. Le passage à SUCCESS et le déplacement du
      // pointeur sont dans la même transaction : soit les deux écritures
      // réussissent, soit aucune n'est appliquée (pas d'état intermédiaire où
      // le déploiement serait SUCCESS sans que le pointeur ait bougé).
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
          projectName: deployment.project.name,
          environmentName:
            deployment.serviceEnv?.environment?.name ??
            deployment.environment?.name ??
            '',
          branch: deployment.branch ?? '',
          triggeredBy: deployment.user?.email ?? 'auto',
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
        projectName: deployment.project.name,
        environmentName:
          deployment.serviceEnv?.environment?.name ??
          deployment.environment?.name ??
          '',
        branch: deployment.branch ?? '',
        triggeredBy: deployment.user?.email ?? 'auto',
        error,
      });
    }
  }

  private emitGatewayLog(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    this.logEmitter.emit(deploymentId, rawMessage, fallbackLevel);
  }
}
