import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

const STALE_THRESHOLD_MINUTES = 45;

/**
 * Detects deployments that have been stuck in RUNNING/PENDING status
 * for longer than STALE_THRESHOLD_MINUTES (e.g. server crash, Ansible
 * process killed externally, network partition) and marks them FAILED.
 *
 * Runs every 10 minutes. Should be safe to run concurrently across
 * multiple instances because the Prisma update is idempotent.
 */
@Injectable()
export class DeploymentsStaleRecoveryService {
  private readonly logger = new Logger(DeploymentsStaleRecoveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverStaleDeployments(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1_000);

    // Fetch first so we can APPEND the recovery note to the existing logs
    // instead of clobbering the build/deploy trail (updateMany can't concat).
    const stale = await this.prisma.deployment.findMany({
      where: {
        status: { in: [DeploymentStatus.RUNNING, DeploymentStatus.PENDING] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, logs: true },
    });
    if (stale.length === 0) return;

    const note = `[RECOVERY] Déploiement marqué FAILED automatiquement après ${STALE_THRESHOLD_MINUTES} min sans activité. Relancez le déploiement.`;

    let count = 0;
    for (const d of stale) {
      // Per-row guard keeps it idempotent + concurrency-safe: a deployment that
      // finished since the fetch (no longer RUNNING/PENDING) is skipped.
      const { count: updated } = await this.prisma.deployment.updateMany({
        where: {
          id: d.id,
          status: { in: [DeploymentStatus.RUNNING, DeploymentStatus.PENDING] },
          updatedAt: { lt: cutoff },
        },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          conditions: [
            {
              type: 'Degraded',
              status: 'False',
              reason: 'AutoRecovered',
              message: note,
              lastTransitionAt: new Date().toISOString(),
            },
          ] as unknown as Prisma.InputJsonValue,
          observedGeneration: 1,
          logs: `${d.logs ?? ''}\n${note}`.trim(),
        },
      });
      count += updated;
    }

    if (count > 0) {
      this.logger.warn(
        `Recovered ${count} stale deployment(s) — marked FAILED`,
      );
    }
  }
}
