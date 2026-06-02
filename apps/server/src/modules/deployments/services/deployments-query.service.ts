import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginationDto, PaginatedResult, paginate } from '../../../core/http/pagination.dto';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';

export const deploymentRelationsInclude = {
  project: { select: { id: true, name: true, gitlabUrl: true } },
  service: {
    select: {
      id: true,
      name: true,
      type: true,
      gitlabProjectId: true,
      repositoryPath: true,
      defaultBranch: true,
    },
  },
  environment: {
    select: {
      id: true,
      name: true,
      server: { select: { id: true, name: true, host: true } },
      serviceTargets: {
        select: {
          id: true,
          serviceId: true,
          port: true,
          domain: true,
          deploymentMode: true,
          server: { select: { id: true, name: true, host: true } },
        },
      },
    },
  },
  user: { select: { id: true, email: true, fullName: true } },
} satisfies Prisma.DeploymentInclude;

export type DeploymentWithRelations = Prisma.DeploymentGetPayload<{
  include: typeof deploymentRelationsInclude;
}>;

@Injectable()
export class DeploymentsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: DeploymentsAuthorizationService,
  ) {}

  computePublicUrl(deployment: DeploymentWithRelations): string | null {
    const serviceId = deployment.serviceId;
    const targets = deployment.environment?.serviceTargets ?? [];
    const target = serviceId
      ? targets.find((t) => t.serviceId === serviceId)
      : (targets[0] ?? null);
    const server = target?.server ?? deployment.environment?.server ?? null;
    if (!server) return null;
    const port = target?.port ?? null;
    if (target?.domain) return `http://${target.domain}`;
    if (port) return `http://${server.host}:${String(port)}`;
    return null;
  }

  enrichDeployment(
    d: DeploymentWithRelations,
  ): DeploymentWithRelations & { publicUrl: string | null } {
    return { ...d, publicUrl: this.computePublicUrl(d) };
  }

  async findAll(
    userId: string,
    userRole: Role,
    pagination?: PaginationDto,
  ): Promise<DeploymentWithRelations[] | PaginatedResult<DeploymentWithRelations>> {
    const where: Prisma.DeploymentWhereInput | undefined =
      userRole === Role.ADMIN
        ? undefined
        : { project: { members: { some: { userId } } } };

    if (!pagination?.page && !pagination?.limit) {
      return this.prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: deploymentRelationsInclude,
      });
    }

    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: deploymentRelationsInclude,
        skip,
        take: limit,
      }),
      this.prisma.deployment.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findByProject(projectId: string, userId: string, userRole: Role) {
    await this.authorizationService.assertCanAccessProject(projectId, userId, userRole);
    const rows = await this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: deploymentRelationsInclude,
    });
    return rows.map((d) => this.enrichDeployment(d));
  }

  async findOne(id: string, userId: string, userRole: Role) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: deploymentRelationsInclude,
    });
    if (!deployment) throw new NotFoundException('Déploiement non trouvé');
    await this.authorizationService.assertCanAccessProject(
      deployment.projectId,
      userId,
      userRole,
    );
    return this.enrichDeployment(deployment);
  }

  async findOneRaw(id: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: deploymentRelationsInclude,
    });
    if (!deployment) throw new NotFoundException('Déploiement non trouvé');
    return deployment;
  }
}
