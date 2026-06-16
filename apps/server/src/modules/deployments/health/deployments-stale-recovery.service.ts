import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

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

    const { count } = await this.prisma.deployment.updateMany({
      where: {
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
            message: `Déploiement interrompu — marqué FAILED automatiquement après ${STALE_THRESHOLD_MINUTES} min sans activité. Relancez le déploiement.`,
            lastTransitionAt: new Date().toISOString(),
          },
        ] as unknown as Prisma.InputJsonValue,
        observedGeneration: 1,
        logs: `[RECOVERY] Déploiement marqué FAILED automatiquement après ${STALE_THRESHOLD_MINUTES} min sans activité.`,
      },
    });

    if (count > 0) {
      this.logger.warn(
        `Recovered ${count} stale deployment(s) — marked FAILED`,
      );
    }
  }
}
