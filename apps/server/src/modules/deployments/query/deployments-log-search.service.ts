import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { DeploymentsQueryService } from './deployments-query.service';

export type LogLevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR';

export interface LogSearchHit {
  lineNumber: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

/**
 * Searches a deployment's log blob (Deployment.logs) line by line. Deployment
 * logs are stored as a single text field, so we filter in memory (bounded per
 * deployment) by a case-insensitive substring and an inferred level.
 */
@Injectable()
export class DeploymentsLogSearchService {
  private static readonly MAX_HITS = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: DeploymentsQueryService,
  ) {}

  async searchLogs(
    deploymentId: string,
    userId: string,
    userRole: Role,
    query: string,
    level: LogLevelFilter = 'ALL',
  ): Promise<{ hits: LogSearchHit[]; total: number }> {
    // Authorization (throws 403/404 if the user cannot access this deployment).
    await this.queryService.findOne(deploymentId, userId, userRole);

    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { logs: true },
    });

    const lines = (deployment?.logs ?? '').split('\n');
    const needle = query.trim().toLowerCase();

    const matches: LogSearchHit[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const message = lines[i];
      if (!message) continue;
      if (needle && !message.toLowerCase().includes(needle)) continue;
      const inferred = this.inferLevel(message);
      if (level !== 'ALL' && inferred !== level) continue;
      matches.push({ lineNumber: i + 1, level: inferred, message });
    }

    return {
      total: matches.length,
      hits: matches.slice(0, DeploymentsLogSearchService.MAX_HITS),
    };
  }

  private inferLevel(message: string): 'INFO' | 'WARN' | 'ERROR' {
    if (/error|fail|fatal|exception|\bERR\b/i.test(message)) return 'ERROR';
    if (/warn|warning/i.test(message)) return 'WARN';
    return 'INFO';
  }
}
