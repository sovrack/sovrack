import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../shared/database/prisma.service';

/**
 * B-5 fix: PipelineRuns that stay PENDING indefinitely were never cleaned up.
 * A push that never triggers a webhook (provider misconfigured, token expired,
 * network gap) leaves an orphan PENDING row forever.
 *
 * Strategy:
 *  - PENDING rows older than 7 days → mark FAILED (webhook never arrived).
 *  - RUNNING rows older than 24 h   → mark FAILED (pipeline hung / provider down).
 *  - SUCCESS/FAILED/CANCELED/IGNORED rows older than 90 days → hard delete
 *    (audit retention: 3 months is enough for operational debugging).
 *
 * Runs once a day at 03:00 UTC to stay clear of peak deploy hours.
 */
@Injectable()
export class PipelineRunsCleanupService {
  private readonly logger = new Logger(PipelineRunsCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupStalePipelineRuns(): Promise<void> {
    const now = new Date();

    const pendingCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const runningCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const retentionCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [stalePending, staleRunning, deleted] = await Promise.all([
      this.prisma.pipelineRun.updateMany({
        where: { status: 'PENDING', createdAt: { lt: pendingCutoff } },
        data: { status: 'FAILED' },
      }),
      this.prisma.pipelineRun.updateMany({
        where: { status: 'RUNNING', updatedAt: { lt: runningCutoff } },
        data: { status: 'FAILED' },
      }),
      this.prisma.pipelineRun.deleteMany({
        where: {
          status: { in: ['SUCCESS', 'FAILED', 'CANCELED', 'IGNORED'] },
          updatedAt: { lt: retentionCutoff },
        },
      }),
    ]);

    if (stalePending.count > 0 || staleRunning.count > 0 || deleted.count > 0) {
      this.logger.log(
        `PipelineRun cleanup: ${stalePending.count} PENDING→FAILED, ` +
          `${staleRunning.count} RUNNING→FAILED, ${deleted.count} old rows deleted.`,
      );
    }
  }
}
