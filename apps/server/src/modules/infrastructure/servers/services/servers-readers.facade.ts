import { Injectable, NotFoundException } from '@nestjs/common';
import { ServerInfraRole } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { ServersAuditService } from './servers-audit.service';
import { ServersDetectionService } from './servers-detection.service';
import { ServersVerificationService } from './servers-verification.service';
import { AuditService } from '../../../audit/audit.service';
import { toPublicServer } from '../shared/server-public.util';
import type { ServerPublic } from '../shared/servers.types';

@Injectable()
export class ServersReadersFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ServersAuditService,
    private readonly detection: ServersDetectionService,
    private readonly verification: ServersVerificationService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Audit ────────────────────────────────────────────────────────────────

  async listAuditEvents(id: string) {
    await this.assertServerExists(id);
    return this.audit.list(id);
  }

  // ─── Detection ────────────────────────────────────────────────────────────

  async listCapabilities(id: string) {
    await this.assertServerExists(id);
    return this.detection.listCapabilities(id);
  }

  async listInstalledTools(id: string) {
    await this.assertServerExists(id);
    return this.detection.listInstalledTools(id);
  }

  // ─── Verification ─────────────────────────────────────────────────────────

  async listValidationResults(id: string) {
    await this.assertServerExists(id);
    return this.verification.listValidationResults(id);
  }

  async getRecentVerificationLogs(id: string, limit = 50) {
    return this.verification.getRecentLogs(id, limit);
  }

  // ─── Infrastructure roles & environments ──────────────────────────────────

  async setServerInfraRole(
    id: string,
    infraRole: ServerInfraRole,
    actorUserId: string,
  ): Promise<ServerPublic> {
    const existing = await this.prisma.server.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Serveur "${id}" non trouvé`);

    const updated = await this.prisma.server.update({
      where: { id },
      data: { infraRole },
    });

    await this.auditService.record(
      actorUserId,
      'SERVER_SET_INFRA_ROLE',
      'Server',
      updated.id,
      { infraRole },
    );

    return toPublicServer(updated);
  }

  async listInfraEnvironments(workspaceId: string): Promise<ServerPublic[]> {
    const servers = await this.prisma.server.findMany({
      where: {
        teamId: workspaceId,
        infraRole: { in: ['STAGING', 'PRODUCTION'] as ServerInfraRole[] },
      },
      orderBy: { name: 'asc' },
    });
    return servers.map((s) => toPublicServer(s));
  }

  async listEnvironmentsForServer(id: string) {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException(`Serveur "${id}" non trouvé`);

    const containers = await this.prisma.container.findMany({
      where: { serverId: id },
      select: {
        deployment: { select: { environmentId: true } },
      },
    });
    const envIds = [
      ...new Set(
        containers.map((c) => c.deployment?.environmentId).filter(Boolean),
      ),
    ] as string[];
    if (envIds.length === 0) return [];
    return this.prisma.environment.findMany({
      where: { id: { in: envIds } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async assertServerExists(id: string): Promise<void> {
    const server = await this.prisma.server.findUnique({ where: { id } });
    if (!server) throw new NotFoundException('Serveur non trouvé');
  }
}
