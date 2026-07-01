import { BadRequestException } from '@nestjs/common';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { conditionsToJson, staleDegradedCondition } from './deployment-conditions.util';
import { STALE_THRESHOLD_MINUTES } from './deployment-stale.constants';

/**
 * Acquiert un slot de déploiement de manière atomique dans une transaction :
 *  1. Verrou advisory PostgreSQL par service-env (anti-race condition).
 *  2. Récupération des déploiements bloqués (stale > STALE_THRESHOLD_MINUTES) → FAILED.
 *  3. Refus si un déploiement PENDING/RUNNING est encore actif.
 *  4. Plafond de concurrence par projet (multi-tenant fair-share).
 *
 * Partagé entre DeploymentsCreateService (chemin API) et
 * DeploymentsAutoTriggerService (chemin webhook) pour garantir la parité
 * exacte de comportement et éviter toute dérive entre les deux implémentations.
 */
export async function acquireDeploySlot(
  tx: Prisma.TransactionClient,
  serviceEnvId: string,
  project: { id: string; maxConcurrentDeploys: number | null },
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext('deploy_env:' || ${serviceEnvId}))
  `;

  const staleTimeout = new Date(
    Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1_000,
  );
  await tx.deployment.updateMany({
    where: {
      serviceEnvId,
      status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
      startedAt: { lt: staleTimeout },
    },
    data: {
      status: DeploymentStatus.FAILED,
      finishedAt: new Date(),
      conditions: conditionsToJson(
        staleDegradedCondition(
          'StaleRecovery',
          'Déploiement récupéré après un crash du service.',
        ),
      ),
    },
  });

  const active = await tx.deployment.findFirst({
    where: {
      serviceEnvId,
      status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
    },
    select: { id: true, status: true },
  });
  if (active) {
    throw new BadRequestException(
      `Un déploiement est déjà en cours pour ce service sur cet environnement ` +
        `(ID: ${active.id}, statut: ${active.status}).`,
    );
  }

  const maxConcurrent = project.maxConcurrentDeploys;
  if (maxConcurrent && maxConcurrent > 0) {
    const inFlight = await tx.deployment.count({
      where: {
        projectId: project.id,
        status: { in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING] },
      },
    });
    if (inFlight >= maxConcurrent) {
      throw new BadRequestException(
        `Limite de déploiements simultanés atteinte pour ce projet ` +
          `(${inFlight}/${maxConcurrent}). Réessayez quand un déploiement en cours sera terminé.`,
      );
    }
  }
}
