import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ProjectAccessService } from '../../catalog/access/project-access.service';
import { CreateProxyRuleDto, UpdateProxyRuleDto } from './dto/proxy-rule.dto';

@Injectable()
export class ProxyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  private async resolveProjectIdFromServer(serverId: string): Promise<string> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { environment: { select: { projectId: true } } },
    });
    if (!server?.environment) {
      throw new NotFoundException(
        'Serveur introuvable ou non rattaché à un projet',
      );
    }
    return server.environment.projectId;
  }

  private async resolveProjectIdFromRule(ruleId: string): Promise<string> {
    const rule = await this.prisma.proxyRule.findUnique({
      where: { id: ruleId },
      include: {
        server: { select: { environment: { select: { projectId: true } } } },
      },
    });
    if (!rule) throw new NotFoundException('Règle proxy introuvable');
    const projectId = rule.server.environment?.projectId;
    if (!projectId) {
      throw new NotFoundException('Serveur non rattaché à un projet');
    }
    return projectId;
  }

  async findAll(
    filters: { serverId?: string; serviceEnvId?: string },
    userId: string,
    userRole: Role,
  ) {
    if (filters.serverId) {
      const projectId = await this.resolveProjectIdFromServer(filters.serverId);
      await this.projectAccess.assertCanAccessProject(
        projectId,
        userId,
        userRole,
      );
    }
    return this.prisma.proxyRule.findMany({
      where: {
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceEnvId && { serviceEnvId: filters.serviceEnvId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, userRole: Role) {
    const rule = await this.prisma.proxyRule.findUnique({
      where: { id },
      include: {
        server: { select: { environment: { select: { projectId: true } } } },
      },
    });
    if (!rule) throw new NotFoundException('Règle proxy introuvable');
    const projectId = rule.server.environment?.projectId;
    if (projectId) {
      await this.projectAccess.assertCanAccessProject(
        projectId,
        userId,
        userRole,
      );
    }
    return rule;
  }

  async create(dto: CreateProxyRuleDto, userId: string, userRole: Role) {
    const projectId = await this.resolveProjectIdFromServer(dto.serverId);
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );

    const domain = dto.domain.trim().toLowerCase();
    const matchingDomain = await this.prisma.domain.findFirst({
      where: {
        name: domain,
        proxyRule: { is: null },
        ...(dto.serviceEnvId ? { serviceEnvId: dto.serviceEnvId } : {}),
      },
      select: { id: true },
    });
    try {
      return await this.prisma.proxyRule.create({
        data: {
          domain,
          domainId: matchingDomain?.id ?? null,
          targetPort: dto.targetPort,
          serverId: dto.serverId,
          sslEnabled: dto.sslEnabled ?? true,
          certType: dto.certType,
          serviceEnvId: dto.serviceEnvId ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Une règle proxy existe déjà pour le domaine ${dto.domain} sur ce serveur`,
        );
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateProxyRuleDto,
    userId: string,
    userRole: Role,
  ) {
    const projectId = await this.resolveProjectIdFromRule(id);
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    return this.prisma.proxyRule.update({
      where: { id },
      data: {
        ...(dto.targetPort !== undefined && { targetPort: dto.targetPort }),
        ...(dto.sslEnabled !== undefined && { sslEnabled: dto.sslEnabled }),
        ...(dto.certType !== undefined && { certType: dto.certType }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string, userId: string, userRole: Role): Promise<void> {
    const projectId = await this.resolveProjectIdFromRule(id);
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.prisma.proxyRule.delete({ where: { id } });
  }

  async toggleActive(id: string, userId: string, userRole: Role) {
    const projectId = await this.resolveProjectIdFromRule(id);
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    const rule = await this.prisma.proxyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle proxy introuvable');
    return this.prisma.proxyRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    });
  }
}
