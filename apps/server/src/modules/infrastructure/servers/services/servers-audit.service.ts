import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';

@Injectable()
export class ServersAuditService {
  private readonly logger = new Logger(ServersAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    serverId: string,
    eventType: string,
    actorId?: string | null,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Unified audit log: SERVER events go to AuditLog alongside the rest.
      await this.prisma.auditLog.create({
        data: {
          resourceType: 'SERVER',
          resourceId: serverId,
          action: eventType,
          ...(actorId ? { userId: actorId } : {}),
          ...(payload ? { metadata: payload as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (error) {
      // Audit should never break the user-facing workflow — but silent drops
      // are an integrity gap: log the failure so a missing audit trail is
      // diagnosable.
      this.logger.error(
        `Écriture d'audit serveur échouée (server=${serverId}, event=${eventType}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Server audit timeline, rebuilt from AuditLog (resourceType=SERVER) into the
   * legacy ServerAuditEvent shape the controller/frontend still expect.
   */
  async list(serverId: string) {
    const rows = await this.prisma.auditLog.findMany({
      where: { resourceType: 'SERVER', resourceId: serverId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      serverId: row.resourceId,
      actorId: row.userId,
      eventType: row.action,
      payloadJson: row.metadata,
      createdAt: row.createdAt,
    }));
  }
}
