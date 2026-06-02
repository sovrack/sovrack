import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class TerminalAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOpen(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.serverAuditEvent.create({
      data: {
        serverId,
        actorId,
        eventType: 'TERMINAL_SESSION_OPEN',
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
    });
  }

  async recordClose(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.serverAuditEvent.create({
      data: {
        serverId,
        actorId,
        eventType: 'TERMINAL_SESSION_CLOSE',
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
    });
  }

  async recordError(
    serverId: string,
    actorId: string,
    payloadJson: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.serverAuditEvent.create({
      data: {
        serverId,
        actorId,
        eventType: 'TERMINAL_SESSION_ERROR',
        payloadJson: payloadJson as Prisma.InputJsonValue,
      },
    });
  }
}
