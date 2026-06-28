import { Injectable } from '@nestjs/common';
import { ServerLogLevel, ServerRunLog } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';

export type AppendServerRunLogInput = {
  serverId?: string | null;
  level: ServerLogLevel;
  source: string;
  message: string;
};

/**
 * Shared persistence for the unified ServerRun / ServerRunStep / ServerRunLog
 * tables. Owns the one piece of logic that used to be duplicated verbatim in
 * both the preparation engine (ServerPreparationService) and the automation
 * engine (AutomationRunnerService): appending a streamed log line with a
 * gap-free, per-run line number under an advisory lock.
 *
 * Domain-specific orchestration (status state machine, role/target tracking,
 * outcome aggregation) stays in each engine — those genuinely differ
 * (single-server N-roles vs N-servers one-action) and are NOT forced together.
 */
@Injectable()
export class ServerRunsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append one line to a run's log with gap-free, per-run line numbers.
   * A per-run advisory lock serializes concurrent appenders so two writers
   * never claim the same lineNumber.
   *
   * The message is stored verbatim — callers redact secrets BEFORE calling.
   * (The two historical callers used different redaction rules; keeping
   * redaction in the callers preserves their exact behavior.)
   */
  async appendLog(
    runId: string,
    input: AppendServerRunLogInput,
  ): Promise<ServerRunLog> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`server-run-log:${runId}`}))`;
      const lastLine = await tx.serverRunLog.findFirst({
        where: { runId },
        orderBy: { lineNumber: 'desc' },
        select: { lineNumber: true },
      });
      return tx.serverRunLog.create({
        data: {
          runId,
          serverId: input.serverId ?? null,
          level: input.level,
          source: input.source,
          message: input.message,
          lineNumber: (lastLine?.lineNumber ?? 0) + 1,
        },
      });
    });
  }

  /** Persisted logs for a run, optionally only the lines after `afterLine`. */
  async getLogs(runId: string, afterLine?: number): Promise<ServerRunLog[]> {
    return this.prisma.serverRunLog.findMany({
      where: {
        runId,
        ...(afterLine ? { lineNumber: { gt: afterLine } } : {}),
      },
      orderBy: { lineNumber: 'asc' },
      take: 1_000,
    });
  }
}
