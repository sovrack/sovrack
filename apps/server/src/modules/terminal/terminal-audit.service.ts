import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class TerminalAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOpen(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.record(serverId, actorId, 'TERMINAL_SESSION_OPEN', payloadJson);
  }

  async recordClose(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.record(serverId, actorId, 'TERMINAL_SESSION_CLOSE', payloadJson);
  }

  async recordError(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.record(serverId, actorId, 'TERMINAL_SESSION_ERROR', payloadJson);
  }

  /** Write a SERVER audit row into the unified AuditLog. */
  private async record(
    serverId: string,
    actorId: string,
    eventType: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        resourceType: 'SERVER',
        resourceId: serverId,
        userId: actorId,
        action: eventType,
        metadata: payloadJson as Prisma.InputJsonValue,
      },
    });
  }
}
