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
  } | null;
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
    workspaceId?: string,
  ): Promise<void> {
    try {
      const teamId =
        workspaceId ??
        (await this.resolveWorkspaceId(resourceType, resourceId, metadata));
      await this.prisma.auditLog.create({
        data: {
          userId,
          teamId,
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
    workspaceId: string,
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<AuditLogListItem>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = { teamId: workspaceId };

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

  private async resolveWorkspaceId(
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<string | undefined> {
    const metadataWorkspaceId = metadata?.workspaceId ?? metadata?.teamId;
    if (typeof metadataWorkspaceId === 'string') return metadataWorkspaceId;
    const projectId = metadata?.projectId;
    if (typeof projectId === 'string') {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { teamId: true },
      });
      if (project) return project.teamId;
    }
    switch (resourceType.toUpperCase()) {
      case 'WORKSPACE':
      case 'TEAM':
        return resourceId;
      case 'PROJECT':
        return (
          await this.prisma.project.findUnique({
            where: { id: resourceId },
            select: { teamId: true },
          })
        )?.teamId;
      case 'DEPLOYMENT':
        return (
          await this.prisma.deployment.findUnique({
            where: { id: resourceId },
            select: { project: { select: { teamId: true } } },
          })
        )?.project.teamId;
      case 'SERVER':
        return (
          await this.prisma.server.findUnique({
            where: { id: resourceId },
            select: { teamId: true },
          })
        )?.teamId;
      case 'SERVICE':
        return (
          await this.prisma.service.findUnique({
            where: { id: resourceId },
            select: { project: { select: { teamId: true } } },
          })
        )?.project.teamId;
      case 'ENVIRONMENT':
        return (
          await this.prisma.environment.findUnique({
            where: { id: resourceId },
            select: { project: { select: { teamId: true } } },
          })
        )?.project.teamId;
      default:
        return undefined;
    }
  }
}
