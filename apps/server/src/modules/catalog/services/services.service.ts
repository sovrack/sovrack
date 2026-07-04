import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  BuildMode,
  DeployTrigger,
  Prisma,
  Role,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { ACTIVE_FILTER } from '../../../shared/database/prisma-active.helper';
import { normalizeRepoPath } from '../../../shared/utils/repo-path.util';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { ProjectAccessService } from '../authorization/project-access.service';
import { SourceProvidersService } from '../../source-providers/source-providers.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { DiscoverGroupDto } from './dto/discover-group.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

// envLinks: explicit `select` (not `include`) so a ServiceEnvironment's
// sensitive fields (secretsEnv — encrypted, but never meant to leave the
// backend perimeter unnecessarily — and env, plaintext vars) never leak
// through this listing route. The frontend only ever reads these 4 scalar
// fields off `service.envLinks[]` (see frontend Service type) — anything
// else here would be dead weight AND a needless exposure surface.
const serviceInclude = {
  envLinks: {
    select: {
      id: true,
      environmentId: true,
      serverId: true,
      currentDeploymentId: true,
      environment: {
        select: { id: true, name: true },
      },
    },
  },
} satisfies Prisma.ServiceInclude;

// secretsEnv is omitted from every read: like Environment/ServiceEnvironment,
// the encrypted service secrets are never returned to the client. They are only
// decrypted at deploy time (deployment-env.service → crypto.decryptSafe).
// databaseCredentials (DATABASE services only — user/password/dbName) is
// ALSO omitted here: unlike secretsEnv it's stored in PLAINTEXT (needed
// as-is by the deploy engine to configure the managed DB container), so
// leaving it un-omitted meant every listing/detail/update response leaked a
// service's DB password in clear text to any project member. Deliberately
// exposed instead via a dedicated, purpose-built endpoint — see
// services-credentials.service.ts — reached only from the DATABASE service
// detail page, not from general listing routes.
export type ServiceWithRelations = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
  omit: { archivedAt: true; secretsEnv: true; databaseCredentials: true };
}>;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceEnvsService: ServiceEnvironmentsService,
    private readonly sourceProviders: SourceProvidersService,
    private readonly projectAccess: ProjectAccessService,
    private readonly crypto: CryptoService,
  ) {}

  private readonly logger = new Logger(ServicesService.name);

  async findAll(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceWithRelations[]> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );

    return await this.prisma.service.findMany({
      where: { projectId, ...ACTIVE_FILTER },
      orderBy: { createdAt: 'asc' },
      omit: { archivedAt: true, secretsEnv: true, databaseCredentials: true },
      include: serviceInclude,
    });
  }

  async findOne(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
    tx?: Prisma.TransactionClient,
  ): Promise<ServiceWithRelations> {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );
    const client = tx ?? this.prisma;

    const service = await client.service.findFirst({
      where: { id: serviceId, projectId, ...ACTIVE_FILTER },
      omit: { archivedAt: true, secretsEnv: true, databaseCredentials: true },
      include: serviceInclude,
    });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }

    return service;
  }

  async discoverGroup(
    projectId: string,
    dto: DiscoverGroupDto,
    userId: string,
    userRole: Role,
  ) {
    await this.projectAccess.assertCanAccessProject(
      projectId,
      userId,
      userRole,
    );
    return this.sourceProviders.discoverGroup(
      projectId,
      dto.groupPath,
      dto.provider,
      dto.token,
      dto.providerId,
    );
  }

  async create(
    projectId: string,
    dto: CreateServiceDto,
    userId: string,
    userRole: Role,
    tx?: Prisma.TransactionClient,
  ) {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    const client = tx ?? this.prisma;

    let service: Awaited<ReturnType<typeof this.prisma.service.create>>;
    try {
      service = await client.service.create({
        data: {
          projectId,
          name: dto.name.trim(),
          type: dto.type,
          description: dto.description?.trim(),
          sourceType: dto.sourceType,
          repoPath: dto.repoPath ? normalizeRepoPath(dto.repoPath) : undefined,
          branch: dto.branch?.trim() || 'main',
          providerId: dto.providerId?.trim(),
          rootDir: dto.rootDir?.trim() || '/',
          buildPack: dto.buildPack,
          buildMode: dto.buildMode ?? BuildMode.LOCAL,
          // Nouveau service → déploiement sur push par défaut (façon Coolify).
          deployTrigger: dto.deployTrigger ?? DeployTrigger.PUSH,
          registryImage: dto.registryImage?.trim() || null,
          buildType: dto.buildType?.trim(),
          dockerfile: dto.dockerfile,
          port: dto.port ?? 3000,
          startCommand: dto.startCommand?.trim(),
          buildArgs: dto.buildArgs || undefined,
          nixpacksConfig: dto.nixpacksConfig || undefined,
          staticConfig: dto.staticConfig || undefined,
          dockerComposeContent: dto.dockerComposeContent,
          composeServiceName: dto.composeServiceName?.trim(),
          databaseType: dto.databaseType,
          databaseVersion: dto.databaseVersion?.trim() || 'latest',
          databaseCredentials:
            dto.type === ServiceType.DATABASE
              ? this.ensureDatabaseCredentials(dto.databaseCredentials)
              : dto.databaseCredentials || undefined,
          externalPort: dto.externalPort ?? undefined,
          env: dto.env,
          // Service-level default secrets encrypted at rest (AES-256-GCM);
          // null when absent. Decrypted only at deploy time (decryptSafe).
          secretsEnv: this.crypto.encryptOptional(dto.secretsEnv),
          healthcheckPath: dto.healthcheckPath?.trim(),
          replicas: dto.replicas ?? 1,
          cpuLimit: dto.cpuLimit ?? undefined,
          memLimitMb: dto.memLimitMb ?? undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `Un service nommé "${dto.name.trim()}" existe déjà dans ce projet. Choisissez un autre nom.`,
        );
      }
      throw err;
    }

    // Auto-créer les ServiceEnvironment pour tous les environnements du projet
    await this.serviceEnvsService.linkServiceToAllEnvs(
      projectId,
      service.id,
      userId,
      userRole,
      tx,
    );

    // Connecter la source si fournie (non-bloquant : le service est créé même si
    // l'enregistrement du webhook GitLab échoue)
    if (dto.source) {
      try {
        await this.sourceProviders.connectRepo(
          projectId,
          dto.source.repoPath,
          dto.source.provider,
          dto.source.token,
          userId,
          userRole,
          dto.source.branch,
          dto.providerId,
        );
      } catch (err) {
        this.logger.warn(
          `connectRepo failed for service ${service.id} (non-fatal): ${String(err)}`,
        );
      }
    }

    return this.findOne(projectId, service.id, userId, userRole, tx);
  }

  async update(
    projectId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    userId: string,
    userRole: Role,
  ) {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureServiceExists(projectId, serviceId);

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() }
          : {}),
        ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
        ...(dto.repoPath !== undefined
          ? {
              repoPath: dto.repoPath
                ? normalizeRepoPath(dto.repoPath)
                : undefined,
            }
          : {}),
        ...(dto.branch !== undefined
          ? { branch: dto.branch?.trim() || 'main' }
          : {}),
        ...(dto.providerId !== undefined
          ? { providerId: dto.providerId?.trim() }
          : {}),
        ...(dto.rootDir !== undefined
          ? { rootDir: dto.rootDir?.trim() || '/' }
          : {}),
        ...(dto.buildPack !== undefined ? { buildPack: dto.buildPack } : {}),
        ...(dto.buildMode !== undefined ? { buildMode: dto.buildMode } : {}),
        ...(dto.deployTrigger !== undefined
          ? { deployTrigger: dto.deployTrigger }
          : {}),
        ...(dto.registryImage !== undefined
          ? { registryImage: dto.registryImage?.trim() || null }
          : {}),
        ...(dto.buildType !== undefined
          ? { buildType: dto.buildType?.trim() }
          : {}),
        ...(dto.dockerfile !== undefined ? { dockerfile: dto.dockerfile } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.startCommand !== undefined
          ? { startCommand: dto.startCommand?.trim() }
          : {}),
        ...(dto.buildArgs !== undefined
          ? { buildArgs: dto.buildArgs || Prisma.JsonNull }
          : {}),
        ...(dto.nixpacksConfig !== undefined
          ? { nixpacksConfig: dto.nixpacksConfig || Prisma.JsonNull }
          : {}),
        ...(dto.staticConfig !== undefined
          ? { staticConfig: dto.staticConfig || Prisma.JsonNull }
          : {}),
        ...(dto.dockerComposeContent !== undefined
          ? { dockerComposeContent: dto.dockerComposeContent }
          : {}),
        ...(dto.composeServiceName !== undefined
          ? { composeServiceName: dto.composeServiceName?.trim() }
          : {}),
        ...(dto.databaseType !== undefined
          ? { databaseType: dto.databaseType }
          : {}),
        ...(dto.databaseVersion !== undefined
          ? { databaseVersion: dto.databaseVersion?.trim() || 'latest' }
          : {}),
        ...(dto.databaseCredentials !== undefined
          ? { databaseCredentials: dto.databaseCredentials || null }
          : {}),
        ...(dto.externalPort !== undefined
          ? { externalPort: dto.externalPort }
          : {}),
        ...(dto.env !== undefined ? { env: dto.env } : {}),
        ...(dto.healthcheckPath !== undefined
          ? { healthcheckPath: dto.healthcheckPath?.trim() }
          : {}),
        ...(dto.replicas !== undefined ? { replicas: dto.replicas } : {}),
        ...(dto.cpuLimit !== undefined ? { cpuLimit: dto.cpuLimit } : {}),
        ...(dto.memLimitMb !== undefined ? { memLimitMb: dto.memLimitMb } : {}),
        // Service-level secrets encrypted at rest (AES-256-GCM); '' clears them.
        ...(dto.secretsEnv !== undefined
          ? { secretsEnv: this.crypto.encryptOptional(dto.secretsEnv) }
          : {}),
      },
      omit: { archivedAt: true, secretsEnv: true, databaseCredentials: true },
      include: serviceInclude,
    });
    // Config du service changée → nouvelle génération désirée pour tous ses
    // ServiceEnvironments (capturée par le prochain Deployment.observedGeneration).
    await this.prisma.serviceEnvironment.updateMany({
      where: { serviceId },
      data: { generation: { increment: 1 } },
    });
    return updated;
  }

  async remove(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    await this.projectAccess.assertCanManageProject(
      projectId,
      userId,
      userRole,
    );
    await this.ensureServiceExists(projectId, serviceId);

    // Soft-delete: archive instead of DELETE so Deployment/Build history that
    // references this service stays intact (SetNull would orphan it). Suffix
    // the name so @@unique([projectId, name]) is freed and the original name
    // can be reused for a new service in the same project.
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true },
    });
    await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        name: `${service?.name ?? serviceId}_archived_${Date.now()}`,
        archivedAt: new Date(),
      },
    });
  }

  /**
   * Garantit qu'un service DATABASE possède des identifiants FORTS. Si l'appelant
   * n'en fournit pas (ou laisse un mot de passe vide/`changeme`), on génère un
   * mot de passe aléatoire de 24 octets. Élimine le défaut historique `changeme`
   * du moteur de déploiement (résolveur d'env DB).
   */
  private ensureDatabaseCredentials(
    provided?: Record<string, string>,
  ): Prisma.InputJsonValue {
    const user = provided?.user?.trim() || 'app';
    const dbName = provided?.dbName?.trim() || 'app';
    const rawPassword = provided?.password?.trim();
    const password =
      rawPassword && rawPassword.toLowerCase() !== 'changeme'
        ? rawPassword
        : randomBytes(24).toString('base64url');
    return { user, password, dbName };
  }

  private async ensureServiceExists(projectId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId, ...ACTIVE_FILTER },
      select: { id: true },
    });
    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }
  }
}
