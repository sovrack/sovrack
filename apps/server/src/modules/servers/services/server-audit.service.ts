import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class ServerAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    serverId: string,
    eventType: string,
    actorId?: string | null,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.serverAuditEvent.create({
        data: {
          serverId,
          eventType,
          ...(actorId ? { actorId } : {}),
          ...(payload ? { payloadJson: payload as Prisma.InputJsonValue } : {}),
        },
      });
    } catch {
      // Audit should never break the user-facing workflow.
    }
  }

  async list(serverId: string) {
    return await this.prisma.serverAuditEvent.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
