import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManagedServiceType, Role, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ACTIVE_FILTER } from '../../../shared/database/prisma-active.helper';
import { ProjectAccessService } from '../authorization/project-access.service';
import { buildServiceAlias } from '../../../shared/utils/container-spec.util';
import { getDatabaseContainerConfig } from '../../../shared/utils/database-spec.util';
import { parseDbCredentials } from '../../../shared/utils/database-spec.util';
import {
  buildDbConnectionUrl,
  dbConnectionEnvKey,
} from '../../../shared/utils/db-connection.util';
import { CryptoService } from '../../../shared/crypto/crypto.service';

/**
 * Connexion INTERNE d'une base : joignable uniquement par les autres conteneurs
 * du projet, via l'alias DNS stable sur le réseau Docker (jamais exposée dehors).
 */
export interface InternalCredentials {
  user: string;
  dbName: string;
  password: string;
  /** Mot de passe root, seulement pour les moteurs qui en ont un distinct. */
  rootPassword: string | null;
  /** Alias DNS interne stable (= nom du service normalisé). */
  host: string;
  /** Port du moteur DANS le conteneur (5432, 3306, …). */
  port: number;
  /** Nom de la variable d'env de connexion (DATABASE_URL / REDIS_URL / AMQP_URL). */
  connectionUrlEnvKey: string;
  /** URL de connexion assemblée sur l'hôte interne. */
  connectionUrl: string;
}

/**
 * Connexion EXTERNE : uniquement si l'utilisateur a défini externalPort. Sert à
 * se connecter depuis l'extérieur du projet — pas nécessaire entre services du
 * même projet (ils passent par l'interne).
 */
export interface ExternalCredentials {
  enabled: boolean;
  /** Port hôte publié (null si non exposé). */
  port: number | null;
}

export interface ServiceCredentials {
  serviceId: string;
  databaseType: ManagedServiceType;
  internal: InternalCredentials;
  external: ExternalCredentials;
}

/**
 * Endpoint DÉDIÉ, à but précis, exposant les credentials en clair d'un service
 * DATABASE — volontairement séparé des routes de listing/détail génériques (qui
 * les `omit` : voir ServicesService), pour ne pas réintroduire la fuite
 * corrigée en Tâche 1. Réservé à la page de détail du service DATABASE, et
 * gardé par une capacité dédiée réservée aux Project MAINTAINER (les OWNER et
 * ADMIN du workspace héritent de ce rôle). L'accès est audité et le blob est
 * déchiffré uniquement pour cette réponse explicite.
 */
@Injectable()
export class ServicesCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly crypto: CryptoService,
  ) {}

  async getCredentials(
    projectId: string,
    serviceId: string,
    userId: string,
    userRole: Role,
  ): Promise<ServiceCredentials> {
    const actor = await this.projectAccess.assertCanReadProjectSecrets(
      projectId,
      userId,
      userRole,
    );

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, projectId, ...ACTIVE_FILTER },
      select: {
        id: true,
        name: true,
        type: true,
        databaseType: true,
        databaseCredentials: true,
        externalPort: true,
        project: { select: { teamId: true } },
      },
    });

    if (!service) {
      throw new NotFoundException('Service non trouvé');
    }
    if (service.type !== ServiceType.DATABASE || !service.databaseType) {
      throw new BadRequestException(
        "Les credentials ne s'appliquent qu'aux services DATABASE",
      );
    }

    const creds = parseDbCredentials(service.databaseCredentials, this.crypto);
    if (!creds.user || !creds.dbName || !creds.password) {
      throw new BadRequestException(
        'Les credentials de cette base sont absents ou indéchiffrables',
      );
    }
    const { user, dbName, password } = creds as Required<typeof creds>;

    await this.prisma.auditLog.create({
      data: {
        userId,
        teamId: actor.workspaceId,
        action: 'SERVICE_CREDENTIALS_REVEALED',
        resourceType: 'Service',
        resourceId: service.id,
        metadata: { projectId },
      },
    });

    const host = buildServiceAlias(service.name);
    const { port } = getDatabaseContainerConfig(service.databaseType);
    const connectionUrl = buildDbConnectionUrl({
      databaseType: service.databaseType,
      host,
      port,
      user,
      password,
      dbName,
    });

    return {
      serviceId: service.id,
      databaseType: service.databaseType,
      internal: {
        user,
        dbName,
        password,
        // Seul MySQL initialise un mot de passe root distinct (MYSQL_ROOT_PASSWORD
        // = le mot de passe du service). Postgres/Mongo utilisent l'utilisateur
        // créé comme super-utilisateur → pas de root séparé à exposer.
        rootPassword:
          service.databaseType === ManagedServiceType.MYSQL ? password : null,
        host,
        port,
        connectionUrlEnvKey: dbConnectionEnvKey(service.databaseType),
        connectionUrl,
      },
      external: {
        enabled: service.externalPort != null,
        port: service.externalPort ?? null,
      },
    };
  }
}
