import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DeploymentsGateway,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverStaleDeployments(): Promise<void> {
    const cutoff = new Date(
      Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1_000,
    );

    const stale = await this.prisma.deployment.findMany({
      where: {
        status: { in: [DeploymentStatus.RUNNING, DeploymentStatus.PENDING] },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, status: true },
    });

    if (stale.length === 0) return;

    this.logger.warn(
      `Found ${stale.length} stale deployment(s) — marking FAILED`,
    );

    for (const deployment of stale) {
      try {
        const updated = await this.prisma.deployment.update({
          where: { id: deployment.id },
          data: {
            status: DeploymentStatus.FAILED,
            finishedAt: new Date(),
            // Reconciliation: a deployment that was interrupted (backend restart,
            // killed process, network partition) is auto-recovered to a clean
            // terminal state with a structured condition explaining why.
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

        this.gateway.emitStatus({
          deploymentId: updated.id,
          status: updated.status,
        });
        this.gateway.emitFinished({
          deploymentId: updated.id,
          status: updated.status,
          finishedAt: updated.finishedAt,
        });

        this.logger.warn(
          `Stale deployment ${deployment.id} (was ${deployment.status}) marked FAILED`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to recover stale deployment ${deployment.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }
}
