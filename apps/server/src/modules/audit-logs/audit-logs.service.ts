import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import {
  type PaginatedResult,
  type PaginationDto,
  paginate,
} from '../../core/http/pagination.dto';

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
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<AuditLogListItem>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
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
      this.prisma.auditLog.count(),
    ]);

    const items: AuditLogListItem[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
      user: row.user,
    }));

    return paginate(items, total, page, limit);
  }
}
