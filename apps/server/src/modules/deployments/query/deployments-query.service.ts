import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { PaginationDto, PaginatedResult, paginate } from '../../../core/http/pagination.dto';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import { EnvLevel, EnvOrigin, resolveEnvDetailed } from '../utils/env-resolver.util';

export interface EnvPreviewVariable {
  key: string;
  origin: EnvOrigin;
  isSecret: boolean;
  /** Real value for non-secrets; '[REDACTED]' for secrets. */
  value: string;
}

export interface EnvPreview {
  variables: EnvPreviewVariable[];
  warnings: string[];
}

export const deploymentRelationsInclude = {
  project: { select: { id: true, name: true } },
  service: {
    select: {
      id: true,
      name: true,
      type: true,
      repoPath: true,
      port: true,
      branch: true,
    },
  },
  environment: {
    select: {
      id: true,
      name: true,
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
    private readonly crypto: CryptoService,
  ) {}

  /**
   * Resolve the variables that WOULD be injected for a given ServiceEnvironment,
   * with provenance and secrets masked. Backs the "Variables Preview" shown
   * before confirming a deploy. Uses the exact same resolver as the executor.
   */
  async previewEnv(serviceEnvId: string): Promise<EnvPreview> {
    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: {
        env: true,
        secretsEnv: true,
        service: { select: { env: true, secretsEnv: true } },
        environment: { select: { env: true, secretsEnv: true } },
      },
    });
    if (!serviceEnv) {
      throw new NotFoundException('Lien service-environnement non trouvé');
    }

    // secretsEnv is encrypted at rest — decrypt before resolving (decryptSafe
    // passes through legacy plaintext / null unchanged).
    const levels: EnvLevel[] = [
      {
        levelName: 'service',
        env: serviceEnv.service?.env ?? null,
        secretsEnv: this.crypto.decryptSafe(serviceEnv.service?.secretsEnv),
      },
      {
        levelName: 'environment',
        env: serviceEnv.environment?.env ?? null,
        secretsEnv: this.crypto.decryptSafe(serviceEnv.environment?.secretsEnv),
      },
      {
        levelName: 'serviceEnvironment',
        env: serviceEnv.env,
        secretsEnv: this.crypto.decryptSafe(serviceEnv.secretsEnv),
      },
    ];

    const resolved = resolveEnvDetailed(levels);
    return {
      variables: resolved.entries
        .map((entry) => ({
          key: entry.key,
          origin: entry.origin,
          isSecret: entry.isSecret,
          value: entry.isSecret ? '[REDACTED]' : entry.value,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
      warnings: resolved.warnings,
    };
  }

  computePublicUrl(deployment: DeploymentWithRelations): string | null {
    const service = deployment.service;
    if (service?.repoPath) {
      const host = service.repoPath.replace(/^https?:\/\//, '').split('/')[0];
      if (host) return `http://${host}:${String(service.port ?? 3000)}`;
    }
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
