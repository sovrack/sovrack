import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CreateProxyRuleDto, UpdateProxyRuleDto } from './dto/proxy-rule.dto';
import { WorkspaceAccessService } from '../../iam/authorization/workspace-access.service';
import {
  WorkspaceAction,
  WorkspaceActions,
} from '../../iam/authorization/workspace-policy.types';

@Injectable()
export class ProxyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  async findAll(
    filters: { serverId?: string; serviceEnvId?: string },
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      WorkspaceActions.READ_SERVER,
    );
    if (filters.serverId) {
      await this.workspaceAccess.assertServerAction(
        filters.serverId,
        userId,
        WorkspaceActions.READ_SERVER,
        workspaceId,
      );
    }
    return this.prisma.proxyRule.findMany({
      where: {
        server: { teamId: workspaceId },
        ...(filters.serverId && { serverId: filters.serverId }),
        ...(filters.serviceEnvId && { serviceEnvId: filters.serviceEnvId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    id: string,
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
    action: WorkspaceAction = WorkspaceActions.READ_SERVER,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      action,
    );
    const rule = await this.prisma.proxyRule.findFirst({
      where: { id, server: { teamId: workspaceId } },
      include: {
        server: { select: { environment: { select: { projectId: true } } } },
      },
    });
    if (!rule) throw new NotFoundException('Règle proxy introuvable');
    return rule;
  }

  async create(
    dto: CreateProxyRuleDto,
    userId: string,
    _userRole: Role,
    requestedWorkspaceId?: string,
  ) {
    const workspaceId = await this.authorizeWorkspace(
      userId,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    await this.workspaceAccess.assertServerAction(
      dto.serverId,
      userId,
      WorkspaceActions.MANAGE_SERVER,
      workspaceId,
    );
    if (dto.serviceEnvId) {
      const serviceEnv = await this.prisma.serviceEnvironment.findFirst({
        where: {
          id: dto.serviceEnvId,
          environment: { project: { teamId: workspaceId } },
        },
        select: { id: true },
      });
      if (!serviceEnv) {
        throw new NotFoundException('Service-environnement introuvable');
      }
    }

    const domain = dto.domain.trim().toLowerCase();
    const matchingDomain = await this.prisma.domain.findFirst({
      where: {
        name: domain,
        proxyRule: { is: null },
        project: { teamId: workspaceId },
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
    requestedWorkspaceId?: string,
  ) {
    await this.findOne(
      id,
      userId,
      userRole,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
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

  async remove(
    id: string,
    userId: string,
    userRole: Role,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    await this.findOne(
      id,
      userId,
      userRole,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    await this.prisma.proxyRule.delete({ where: { id } });
  }

  async toggleActive(
    id: string,
    userId: string,
    userRole: Role,
    requestedWorkspaceId?: string,
  ) {
    const rule = await this.findOne(
      id,
      userId,
      userRole,
      requestedWorkspaceId,
      WorkspaceActions.MANAGE_SERVER,
    );
    return this.prisma.proxyRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    });
  }

  private async authorizeWorkspace(
    userId: string,
    requestedWorkspaceId: string | undefined,
    action: WorkspaceAction,
  ): Promise<string> {
    const workspaceId = await this.workspaceAccess.resolveWorkspaceId(
      userId,
      requestedWorkspaceId,
    );
    await this.workspaceAccess.assertWorkspaceAction(
      workspaceId,
      userId,
      action,
    );
    return workspaceId;
  }
}
