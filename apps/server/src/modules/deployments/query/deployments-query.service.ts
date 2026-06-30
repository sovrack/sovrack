import { Injectable, NotFoundException } from '@nestjs/common';
import { ContainerStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import {
  PaginationDto,
  PaginatedResult,
  paginate,
} from '../../../shared/http/pagination.dto';
import { DeploymentsAuthorizationService } from './deployments-authorization.service';
import {
  EnvLevel,
  EnvOrigin,
  resolveEnvDetailed,
} from '../utils/env-resolver.util';

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
  // Pour résoudre l'URL publique : domaine rattaché (Traefik HTTPS) ou, à défaut,
  // le serveur de l'environnement (http://host:port).
  serviceEnv: {
    select: {
      domains: { select: { name: true }, take: 1 },
      environment: {
        select: {
          servers: {
            where: { isActive: true },
            select: { host: true },
            take: 1,
          },
        },
      },
    },
  },
  user: { select: { id: true, email: true, fullName: true } },
  // « Live » réel = ce déploiement a un conteneur RUNNING (≠ status SUCCESS qui
  // est historique). Permet au front de marquer UN seul déploiement actif et
  // d'afficher « Superseded » sur les anciens SUCCESS.
  containers: {
    where: { status: ContainerStatus.RUNNING },
    select: { id: true },
    take: 1,
  },
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
  async previewEnv(
    serviceEnvId: string,
    userId: string,
    userRole: Role,
  ): Promise<EnvPreview> {
    const serviceEnv = await this.prisma.serviceEnvironment.findUnique({
      where: { id: serviceEnvId },
      select: {
        env: true,
        secretsEnv: true,
        service: { select: { env: true, secretsEnv: true, projectId: true } },
        environment: {
          select: { env: true, secretsEnv: true, projectId: true },
        },
      },
    });
    if (!serviceEnv) {
      throw new NotFoundException('Lien service-environnement non trouvé');
    }

    const projectId =
      serviceEnv.service?.projectId ?? serviceEnv.environment?.projectId;
    if (!projectId) {
      throw new NotFoundException(
        'Projet introuvable pour ce lien service-env',
      );
    }
    await this.authorizationService.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

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

  /**
   * URL publique pour ouvrir l'app :
   *  1. Domaine rattaché au service-env → https://<domaine> (route Traefik).
   *  2. Sinon, le serveur de l'environnement → http://<host>:<port> (port hôte).
   * (Plus de repoPath comme host — c'était le namespace du repo, non joignable.)
   */
  computePublicUrl(deployment: DeploymentWithRelations): string | null {
    const domain = deployment.serviceEnv?.domains?.[0]?.name;
    if (domain) return `https://${domain}`;

    const host = deployment.serviceEnv?.environment?.servers?.[0]?.host;
    if (host) {
      return `http://${host}:${String(deployment.service?.port ?? 3000)}`;
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
  ): Promise<
    DeploymentWithRelations[] | PaginatedResult<DeploymentWithRelations>
  > {
    const where: Prisma.DeploymentWhereInput | undefined =
      userRole === Role.ADMIN
        ? undefined
        : { project: { members: { some: { userId } } } };

    const MAX_UNPAGINATED = 200;
    if (!pagination?.page && !pagination?.limit) {
      return this.prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: deploymentRelationsInclude,
        take: MAX_UNPAGINATED,
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
    await this.authorizationService.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );
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
