import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import {
  type PaginatedResult,
  type PaginationDto,
  paginate,
} from '../../shared/http/pagination.dto';

export type AuditLogListItem = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          resourceType,
          resourceId,
          ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Audit log ignoré (${action}) : ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    }
  }

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<AuditLogListItem>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    // Only user-attributed events appear in the general audit list. SERVER
    // events merged from the former ServerAuditEvent may be actorless (null
    // userId) and are read separately via ServersAuditService.list().
    const where: Prisma.AuditLogWhereInput = { userId: { not: null } };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogListItem[] = rows.flatMap((row) =>
      row.user
        ? [
            {
              id: row.id,
              action: row.action,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              metadata:
                (row.metadata as Record<string, unknown> | null) ?? null,
              createdAt: row.createdAt,
              user: row.user,
            },
          ]
        : [],
    );

    return paginate(items, total, page, limit);
  }
}
