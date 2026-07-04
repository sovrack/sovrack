import { Injectable, Logger } from '@nestjs/common';
import { ManagedServiceType, Prisma, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { toDockerEnvArray } from '../../../shared/utils/container-spec.util';
import { buildDbConnectionEnv } from '../../../shared/utils/db-connection.util';
import {
  buildDatabaseEnvVars,
  getDatabaseContainerConfig,
  parseDbCredentials,
} from '../../../shared/utils/database-spec.util';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { CryptoService } from '../../../shared/crypto/crypto.service';
import { EnvLevel, resolveEnvDetailed } from '../utils/env-resolver.util';
import { DeploymentLogEmitter } from './deployment-log-emitter.service';

/**
 * Préparation de l'environnement d'exécution d'un déploiement :
 *  - fusion des 3 niveaux de variables (service / environnement / serviceEnv),
 *  - auto-câblage des bases managées du même projet+env (DATABASE_URL…),
 *  - provisionnement du volume de données pour les services DATABASE.
 *
 * Extrait de DockerDeployExecutorService pour isoler la résolution d'env/DB de
 * l'orchestration du cycle de vie des conteneurs.
 */
@Injectable()
export class DeploymentEnvService {
  private readonly logger = new Logger(DeploymentEnvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly crypto: CryptoService,
    private readonly logEmitter: DeploymentLogEmitter,
  ) {}

  /**
   * Build the ordered 3-level input for {@link resolveEnvDetailed}. The
   * "environment" level reads from serviceEnv.environment when available (the
   * standard ServiceEnvironment path), else the directly-linked environment
   * (legacy / database path).
   */
  private buildEnvLevels(deployment: {
    service?: { env?: string | null; secretsEnv?: string | null } | null;
    serviceEnv?: {
      env?: string | null;
      secretsEnv?: string | null;
      environment: { env?: string | null; secretsEnv?: string | null };
    } | null;
    environment?: { env?: string | null; secretsEnv?: string | null } | null;
  }): EnvLevel[] {
    const envLevel =
      deployment.serviceEnv?.environment ?? deployment.environment ?? null;
    // secretsEnv is encrypted at rest — decrypt before the resolver parses it
    // (decryptSafe passes through legacy plaintext / null unchanged).
    return [
      {
        levelName: 'service',
        env: deployment.service?.env ?? null,
        secretsEnv: this.crypto.decryptSafe(deployment.service?.secretsEnv),
      },
      {
        levelName: 'environment',
        env: envLevel?.env ?? null,
        secretsEnv: this.crypto.decryptSafe(envLevel?.secretsEnv),
      },
      {
        levelName: 'serviceEnvironment',
        env: deployment.serviceEnv?.env ?? null,
        secretsEnv: this.crypto.decryptSafe(deployment.serviceEnv?.secretsEnv),
      },
    ];
  }

  /**
   * Auto-câblage : pour une APP, génère les variables de connexion (DATABASE_URL,
   * REDIS_URL, AMQP_URL) vers les bases managées du MÊME projet + environnement,
   * en pointant sur leur alias DNS stable. Injecté au plus bas niveau → toute
   * valeur définie par l'utilisateur l'emporte. Façon Coolify/Dokploy.
   */
  async resolveAutoWiredDbEnv(deployment: {
    project: { id: string };
    service?: { id: string; type: ServiceType } | null;
    serviceEnv?: { environment: { id: string } } | null;
    environment?: { id: string } | null;
  }): Promise<string | null> {
    if (deployment.service?.type === ServiceType.DATABASE) return null;
    const projectId = deployment.project.id;
    const envId =
      deployment.serviceEnv?.environment?.id ??
      deployment.environment?.id ??
      null;
    if (!envId) return null;

    const dbs = await this.prisma.service.findMany({
      where: {
        projectId,
        type: ServiceType.DATABASE,
        databaseType: { not: null },
        ...(deployment.service?.id
          ? { id: { not: deployment.service.id } }
          : {}),
        envLinks: { some: { environmentId: envId, archivedAt: null } },
      },
      select: { name: true, databaseType: true, databaseCredentials: true },
    });
    if (dbs.length === 0) return null;

    const links = dbs
      .filter(
        (d): d is typeof d & { databaseType: ManagedServiceType } =>
          d.databaseType !== null,
      )
      .map((d) => {
        const creds = parseDbCredentials(d.databaseCredentials);
        return {
          name: d.name,
          databaseType: d.databaseType,
          user: creds.user,
          password: creds.password,
          dbName: creds.dbName,
        };
      });
    // JSON objet — format attendu par resolveEnvDetailed pour un EnvLevel.env
    // (le format « lignes KEY=VALUE » était silencieusement écarté : conteneur
    // démarré sans DATABASE_URL/REDIS_URL → crash-loop Prisma).
    const vars = buildDbConnectionEnv(links);
    return Object.keys(vars).length > 0 ? JSON.stringify(vars) : null;
  }

  /**
   * Resolve and merge all env levels, emit gateway warnings, return the final
   * envVars array, the full resolution result (for buildSuccessConditions), and
   * the initial command-log string.
   */
  resolveDeploymentEnv(
    deployment: {
      id: string;
      service?: { env?: string | null; secretsEnv?: string | null } | null;
      serviceEnv?: {
        env?: string | null;
        secretsEnv?: string | null;
        environment: { env?: string | null; secretsEnv?: string | null };
      } | null;
      environment?: { env?: string | null; secretsEnv?: string | null } | null;
    },
    autoDbEnv: string | null,
  ): {
    envVars: string[];
    envResolution: ReturnType<typeof resolveEnvDetailed>;
    commandLogs: string;
  } {
    const levels = this.buildEnvLevels(deployment);
    if (autoDbEnv) {
      levels.unshift({
        levelName: 'auto-db',
        env: autoDbEnv,
        secretsEnv: null,
      });
    }
    const envResolution = resolveEnvDetailed(levels);
    const envVars = toDockerEnvArray(envResolution.entries);

    let commandLogs = '';
    for (const warning of envResolution.warnings) {
      this.logEmitter.emit(
        deployment.id,
        `[ENV] Variable non résolue: ${warning}`,
        'error',
      );
      this.logger.warn(
        `Deployment ${deployment.id} env resolution warning: ${warning}`,
      );
      commandLogs += `[ENV] ${warning}\n`;
    }
    return { envVars, envResolution, commandLogs };
  }

  /**
   * For DATABASE service types: create the data volume on the server, inject
   * the DB-specific env vars into the existing envVars array, and return the
   * volume name + path for bind-mount wiring (both undefined for non-DB).
   *
   * Real bug fixed here (RAPPORT_DEPLOIEMENT_REEL.md, Tâche 4 point 6): the
   * volume name used to be derived from `deployment.id` — a FRESH id on
   * every redeploy (each redeploy creates its own Deployment row) — so every
   * redeploy of a DATABASE service silently created a brand-new EMPTY
   * volume instead of reattaching to the previous one, losing all data.
   * Naming it from `service.id` (stable for the service's whole lifetime)
   * fixes this: `docker volume create` is idempotent, so a redeploy just
   * reattaches to the existing volume instead of creating a fresh one.
   */
  async setupDbVolume(
    deployment: {
      service?: {
        id: string;
        type?: ServiceType | null;
        databaseType?: string | null;
        databaseCredentials?: unknown;
      } | null;
    },
    serverId: string,
    envVars: string[],
    _servicePort: number,
  ): Promise<{
    dbVolumeName: string | undefined;
    dbVolumePath: string | undefined;
    commandLogs: string;
  }> {
    if (
      deployment.service?.type !== ServiceType.DATABASE ||
      !deployment.service.databaseType
    ) {
      return {
        dbVolumeName: undefined,
        dbVolumePath: undefined,
        commandLogs: '',
      };
    }

    const dbConfig = getDatabaseContainerConfig(
      deployment.service.databaseType as ManagedServiceType,
    );
    const dbVolumeName = `${deployment.service.id}-data`;
    const dbVolumePath = dbConfig.dataPath;

    await this.docker.createVolume(serverId, dbVolumeName);
    const commandLogs = `Volume de données créé : ${dbVolumeName}\n`;

    const dbEnv = buildDatabaseEnvVars(
      deployment.service.databaseType as ManagedServiceType,
      deployment.service.databaseCredentials as Prisma.JsonValue | undefined,
    );
    for (const [key, value] of Object.entries(dbEnv)) {
      const entry = `${key}=${value}`;
      if (!envVars.includes(entry)) {
        envVars.push(entry);
      }
    }
    return { dbVolumeName, dbVolumePath, commandLogs };
  }
}
