import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { DockerDeployExecutorService } from '../core/docker-deploy-executor.service';
import { DeploymentPreflightService } from '../core/deployment-preflight.service';
import {
  conditionsToJson,
  containerCrashedCondition,
  configDriftCondition,
} from '../utils/deployment-conditions.util';

/** Container states that mean the desired RUNNING state has drifted. */
const DEAD_STATES = new Set(['exited', 'dead']);
/** Don't re-heal a service-env that was auto-healed less than this ago (anti-storm). */
const HEAL_COOLDOWN_MS = 5 * 60_000;

/**
 * État OBSERVÉ d'un conteneur, normalisé :
 *  - alive   : il tourne (running/restarting/paused/created…) → rien à recréer
 *  - dead    : exited/dead → recréer
 *  - missing : l'inspect renvoie 404 (conteneur supprimé : reboot, docker rm,
 *              nettoyage) → recréer (AVANT: cette erreur était juste loggée, le
 *              conteneur n'était JAMAIS recréé → app DOWN)
 *  - unknown : daemon injoignable / erreur non-404 → NE PAS agir (on ignore le
 *              vrai état, recréer à l'aveugle serait dangereux)
 */
type ObservedKind = 'alive' | 'dead' | 'missing' | 'unknown';
interface ObservedState {
  kind: ObservedKind;
  /** Statut Docker brut (ex. "exited") ou "missing" — sert au autoHealReason. */
  status: string;
}

/** Détecte une erreur "conteneur introuvable" (dockerode : statusCode 404). */
function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as { statusCode?: number; message?: string };
    if (e.statusCode === 404) return true;
    if (typeof e.message === 'string' && /no such container/i.test(e.message)) {
      return true;
    }
  }
  return false;
}

type ReconcileDeployment = {
  id: string;
  branch: string;
  specSnapshot: Prisma.JsonValue;
  resolvedRefs: Prisma.JsonValue;
  conditions: Prisma.JsonValue;
  observedGeneration: number | null;
  dockerImage: string | null;
  imageSha: string | null;
  isAutoHealed: boolean;
  createdAt: Date;
  containers: Array<{ id: string; dockerId: string; name: string }>;
};

type ReconcileCandidate = {
  id: string;
  serviceId: string;
  environmentId: string;
  generation: number;
  service: { projectId: string };
  /** Pointeur "release courante" (L3) — null pour les cellules legacy. */
  currentDeployment: ReconcileDeployment | null;
  deployments: ReconcileDeployment[];
};

/** Champs sélectionnés pour un déploiement à réconcilier (pointeur + fallback). */
const DEPLOYMENT_SELECT = {
  id: true,
  branch: true,
  specSnapshot: true,
  resolvedRefs: true,
  conditions: true,
  observedGeneration: true,
  dockerImage: true,
  imageSha: true,
  isAutoHealed: true,
  createdAt: true,
  containers: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, dockerId: true, name: true },
  },
} satisfies Prisma.DeploymentSelect;

/**
 * Declarative reconciler (self-healing). Every minute it compares the DESIRED
 * state of each active ServiceEnvironment (its latest SUCCESS Deployment = a
 * running container at the desired `generation`) with the OBSERVED state
 * (Docker API):
 *
 *  - Runtime drift  : the container is dead OR has disappeared (404) → recreate
 *    it from the frozen immutable image, record a Degraded condition, notify.
 *  - Config drift   : the cell's `generation` is ahead of the deployment's
 *    `observedGeneration` → mark the deployment OutOfSync (ConfigDrift). NO
 *    auto-redeploy: applying a config change is a deliberate action (esp. prod).
 *
 * This is the loop that turns the deploy tool into a platform.
 */
@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dockerApi: DockerApiService,
    private readonly deployExecutor: DockerDeployExecutorService,
    private readonly notifications: NotificationsService,
    private readonly preflight: DeploymentPreflightService,
  ) {}

  @Cron('*/1 * * * *', { name: 'deployment-reconciler' })
  async reconcile(): Promise<void> {
    const serviceEnvs = await this.prisma.serviceEnvironment.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        serviceId: true,
        environmentId: true,
        generation: true,
        service: { select: { projectId: true } },
        // Pointeur "release courante" (L3) = source AUTORITAIRE du live. Fallback
        // sur le dernier SUCCESS (cellules legacy sans pointeur encore posé).
        currentDeployment: { select: DEPLOYMENT_SELECT },
        deployments: {
          where: { status: DeploymentStatus.SUCCESS },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: DEPLOYMENT_SELECT,
        },
      },
    });

    for (const env of serviceEnvs) {
      try {
        await this.reconcileOne(env);
      } catch (error) {
        this.logger.warn(
          `Reconcile failed for serviceEnv ${env.id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }

  private async reconcileOne(env: ReconcileCandidate): Promise<void> {
    // Source AUTORITAIRE du live = le pointeur "release courante" ; fallback sur
    // le dernier SUCCESS pour les cellules legacy (pointeur pas encore posé).
    const last = env.currentDeployment ?? env.deployments[0];
    const containers = last?.containers ?? [];
    if (!last || containers.length === 0) {
      return; // nothing deployed yet → nothing to reconcile
    }

    // Anti-storm: skip if we just auto-healed this env.
    if (
      last.isAutoHealed &&
      Date.now() - last.createdAt.getTime() < HEAL_COOLDOWN_MS
    ) {
      return;
    }

    const serverId = (last.resolvedRefs as { serverId?: string } | null)
      ?.serverId;
    if (!serverId) {
      return; // no resolved server (legacy row) → cannot inspect
    }

    // Skip if a deployment is already in flight for this service-env.
    const activeCount = await this.prisma.deployment.count({
      where: {
        serviceEnvId: env.id,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
      },
    });
    if (activeCount > 0) {
      return;
    }

    // Check ALL replica containers. If any state is unknown (daemon down),
    // skip to avoid acting blindly. If any is dead/missing, heal the whole
    // deployment (creates N fresh containers from the frozen image).
    const states = await Promise.all(
      containers.map((c) => this.observeContainerState(serverId, c.dockerId)),
    );

    if (states.some((s) => s.kind === 'unknown')) {
      return; // daemon unreachable — don't act blindly
    }

    const downIdx = states.findIndex(
      (s) => s.kind === 'dead' || s.kind === 'missing',
    );
    if (downIdx !== -1) {
      await this.healContainer(
        env,
        last,
        containers[downIdx],
        serverId,
        states[downIdx].status,
      );
      return;
    }

    // All containers alive → check CONFIG drift (desired vs deployed gen).
    await this.detectConfigDrift(env, last);
  }

  /** Inspecte le conteneur et normalise son état (gère le 404 = missing). */
  private async observeContainerState(
    serverId: string,
    dockerId: string,
  ): Promise<ObservedState> {
    try {
      const inspect = await this.dockerApi.inspectContainer(serverId, dockerId);
      const status = inspect.State?.Status ?? 'unknown';
      if (DEAD_STATES.has(status)) {
        return { kind: 'dead', status };
      }
      if (status === 'unknown') {
        return { kind: 'unknown', status };
      }
      return { kind: 'alive', status };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { kind: 'missing', status: 'missing' };
      }
      this.logger.warn(
        `[Reconciler] inspect failed for ${dockerId} on server ${serverId}: ` +
          `${error instanceof Error ? error.message : 'unknown'} — skipping (état indéterminé)`,
      );
      return { kind: 'unknown', status: 'unknown' };
    }
  }

  /** Recrée le conteneur (mort ou disparu) depuis l'image immuable gelée. */
  private async healContainer(
    env: ReconcileCandidate,
    last: ReconcileCandidate['deployments'][number],
    container: { name: string },
    serverId: string,
    observedStatus: string,
  ): Promise<void> {
    this.logger.warn(
      `[Reconciler] Container ${container.name} is ${observedStatus} on server ${serverId} — auto-healing`,
    );

    // Minimal server guard (C1) — don't attempt to auto-heal onto a server
    // that's disabled/unverified/not-prepared or whose Docker circuit
    // breaker is open. Propagates to reconcile()'s per-serviceEnv try/catch,
    // which logs and moves on to the next candidate.
    await this.preflight.assertServerReady(serverId);

    // Record the drift on the (previously SUCCESS) deployment.
    await this.prisma.deployment.update({
      where: { id: last.id },
      data: {
        conditions: conditionsToJson(containerCrashedCondition(observedStatus)),
      },
    });

    // Create an auto-heal Deployment that reuses the frozen spec + immutable image.
    const heal = await this.prisma.deployment.create({
      data: {
        projectId: env.service.projectId,
        serviceId: env.serviceId,
        serviceEnvId: env.id,
        environmentId: env.environmentId,
        branch: last.branch,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
        specSnapshot: (last.specSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        resolvedRefs: (last.resolvedRefs ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        dockerImage: last.dockerImage,
        imageSha: last.imageSha,
        observedGeneration: last.observedGeneration,
        isAutoHealed: true,
        autoHealReason: `container_${observedStatus}`,
        previousDeploymentId: last.id,
      },
      select: { id: true },
    });

    // Re-pull the immutable image and recreate the container.
    void this.deployExecutor
      .executeDeploy(heal.id, last.imageSha ?? last.dockerImage ?? undefined)
      .catch((err: unknown) =>
        this.logger.error(
          `[Reconciler] Auto-heal deploy ${heal.id} failed: ${err instanceof Error ? err.message : 'unknown'}`,
        ),
      );

    await this.notifications
      .notifyAutoHeal({
        serviceEnvId: env.id,
        containerName: container.name,
        reason: `Container observed ${observedStatus}`,
      })
      .catch(() => undefined);
  }

  /**
   * Marque le déploiement live OutOfSync quand la config désirée (generation de
   * la cellule) dépasse celle déployée (observedGeneration). Idempotent : ne
   * réécrit pas si la condition ConfigDrift est déjà posée (anti-churn). PAS de
   * redéploiement auto — l'application reste une décision explicite.
   */
  private async detectConfigDrift(
    env: ReconcileCandidate,
    last: ReconcileCandidate['deployments'][number],
  ): Promise<void> {
    const desired = env.generation ?? 0;
    const observedGen = last.observedGeneration ?? 0;
    if (desired <= observedGen) {
      return; // in sync
    }

    const existing = Array.isArray(last.conditions)
      ? (last.conditions as Array<{ reason?: string }>)
      : [];
    if (existing.some((c) => c && c.reason === 'ConfigDrift')) {
      return; // already flagged → no churn
    }

    this.logger.warn(
      `[Reconciler] serviceEnv ${env.id} OutOfSync (génération désirée ${desired} > déployée ${observedGen})`,
    );
    await this.prisma.deployment.update({
      where: { id: last.id },
      data: {
        conditions: conditionsToJson(
          configDriftCondition(desired, observedGen),
        ),
      },
    });

    await this.notifications
      .notifyConfigDrift({
        serviceEnvId: env.id,
        desiredGeneration: desired,
        deployedGeneration: observedGen,
      })
      .catch(() => undefined);
  }
}
