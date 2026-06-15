import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContainerStatus, Deployment, DeploymentStatus, DeploymentStrategy, ManagedServiceType, Prisma, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from '../health/deployments-healthcheck.service';
import { EnvLevel, resolveEnvDetailed } from '../utils/env-resolver.util';
import { getLogContext, runWithLogContext, setLogContext } from '../../../core/logger/log-context';
import { randomUUID } from 'crypto';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DockerDeployExecutorService {
  private readonly logger = new Logger(DockerDeployExecutorService.name);

  // Blue-green: the green container publishes on canonical+offset so it can run
  // alongside the live (blue) container until it is verified healthy.
  private static readonly BLUE_GREEN_PORT_OFFSET = 1;
  private static readonly BLUE_GREEN_DRAIN_MS = 3000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly gateway: DeploymentsGateway,
    private readonly healthcheckService: DeploymentsHealthcheckService,
    private readonly crypto: CryptoService,
  ) {}

  private buildConditions(
    type: 'Progressing' | 'Ready' | 'Degraded',
    reason: string,
    message: string,
  ): Prisma.InputJsonValue {
    return [
      {
        type,
        status: type === 'Degraded' ? 'False' : 'True',
        reason,
        message,
        lastTransitionAt: new Date().toISOString(),
      },
    ];
  }

  async executeDeploy(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    // Establish (or inherit) a logging context so every line emitted during the
    // deploy carries the correlationId + deploymentId for end-to-end tracing.
    return runWithLogContext(
      { correlationId: getLogContext().correlationId ?? randomUUID(), deploymentId },
      () => this.executeDeployInternal(deploymentId, overrideImage),
    );
  }

  private async executeDeployInternal(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, port: true, env: true, secretsEnv: true, dockerComposeContent: true, repoPath: true, branch: true, startCommand: true, type: true, databaseType: true, databaseVersion: true, databaseCredentials: true, healthcheckPath: true } },
        serviceEnv: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                env: true,
                secretsEnv: true,
                servers: { where: { isActive: true, isVerified: true }, select: { id: true, name: true, host: true } },
              },
            },
          },
        },
        environment: { select: { id: true, name: true, env: true, secretsEnv: true } },
        user: { select: { id: true, email: true, fullName: true, role: true } },
        build: { select: { id: true, imageSha: true, buildPack: true, isLocalBuild: true } },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    setLogContext({ serviceEnvId: deployment.serviceEnv?.id, userId: deployment.user?.id });

    // Résoudre le serveur : d'abord via serviceEnv, puis via resolvedRefs (backward compat)
    const servers = deployment.serviceEnv?.environment.servers ?? [];
    const resolvedRefs = deployment.resolvedRefs as { serverId?: string } | null;
    const serverId = servers[0]?.id ?? resolvedRefs?.serverId;
    if (!serverId) throw new BadRequestException('Aucun serveur cible trouvé');

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });
    if (!server) throw new BadRequestException('Serveur cible introuvable');
    if (!server.isVerified) throw new BadRequestException('Serveur non vérifié');

    const serviceName = deployment.service?.name ?? deployment.project.name;
    const containerName = `deploy-${deployment.project.name}-${serviceName}-${deployment.id.slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    let servicePort = deployment.service?.port ?? 3000;
    const envResolution = resolveEnvDetailed(this.buildEnvLevels(deployment));
    const envVars = envResolution.entries.map((entry) => `${entry.key}=${entry.value}`);

    let commandLogs = '';
    // Surface (do NOT swallow) any unresolved env/secret level so the operator
    // sees it in the live deploy log instead of getting a container missing
    // a critical variable silently. Non-blocking: the deploy continues.
    for (const warning of envResolution.warnings) {
      this.emitGatewayLog(deployment.id, `[ENV] Variable non résolue: ${warning}`, 'error');
      this.logger.warn(`Deployment ${deployment.id} env resolution warning: ${warning}`);
      commandLogs += `[ENV] ${warning}\n`;
    }
    let dbVolumeName: string | undefined;
    let dbVolumePath: string | undefined;
    if (deployment.service?.type === ServiceType.DATABASE && deployment.service.databaseType) {
      const dbConfig = this.getDatabaseContainerConfig(deployment.service.databaseType);
      servicePort = dbConfig.port;
      dbVolumeName = `${deployment.id}-data`;
      dbVolumePath = dbConfig.dataPath;

      await this.docker.createVolume(serverId, dbVolumeName);
      commandLogs += `Volume de données créé : ${dbVolumeName}\n`;

      const dbEnv = this.resolveDatabaseEnvVars(
        deployment.service.databaseType,
        deployment.service.databaseCredentials,
      );
      for (const [key, value] of Object.entries(dbEnv)) {
        const entry = `${key}=${value}`;
        if (!envVars.includes(entry)) {
          envVars.push(entry);
        }
      }
    }

    // Blue-green only applies to stateless application containers; stateful
    // databases keep the standard in-place path. When enabled, the new (green)
    // container publishes on a standby port so the live (blue) one keeps serving
    // until green passes its health-check.
    const blueGreen =
      deployment.strategy === DeploymentStrategy.BLUE_GREEN &&
      deployment.service?.type !== ServiceType.DATABASE;
    const publishPort = blueGreen
      ? servicePort + DockerDeployExecutorService.BLUE_GREEN_PORT_OFFSET
      : servicePort;
    if (blueGreen) {
      this.emitGatewayLog(deployment.id, `[BLUE-GREEN] Conteneur green sur le port ${publishPort} (blue reste actif).`, 'info');
      commandLogs += `[BLUE-GREEN] Green publié sur ${publishPort}\n`;
    }

    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        conditions: this.buildConditions('Progressing', 'DockerDeploy', 'Déploiement Docker en cours.'),
        logs: `${deployment.logs ?? ''}\nDéploiement Docker en cours...`.trim(),
      },
    });

    try {
      const imageRef = await this.resolveImageRef(deployment, overrideImage, serverId);
      commandLogs += `Image résolue : ${imageRef}\n`;

      this.emitGatewayLog(deployment.id, `Pull de l'image ${imageRef}...`, 'info');
      await this.docker.pullImage(serverId, imageRef);
      commandLogs += `Image pullée : ${imageRef}\n`;

      const existing = await this.docker.listContainers(serverId, true);
      const oldContainer = existing.find((c) => c.Names?.includes(`/${containerName}`));
      if (oldContainer) {
        this.emitGatewayLog(deployment.id, `Suppression de l'ancien conteneur ${containerName}...`, 'info');
        await this.docker.removeContainer(serverId, oldContainer.Id, true);
        commandLogs += `Ancien conteneur supprimé : ${oldContainer.Id.slice(0, 12)}\n`;
      }

      this.emitGatewayLog(deployment.id, 'Création du conteneur...', 'info');
      const container = await this.docker.createContainer(serverId, {
        Image: imageRef,
        name: containerName,
        Env: envVars,
        ExposedPorts: { [`${servicePort}/tcp`]: {} },
        HostConfig: {
          PortBindings: { [`${servicePort}/tcp`]: [{ HostPort: String(publishPort) }] },
          RestartPolicy: { Name: 'unless-stopped' },
          AutoRemove: false,
          ...(dbVolumeName && dbVolumePath ? { Binds: [`${dbVolumeName}:${dbVolumePath}`] } : {}),
        },
        Cmd: deployment.service?.startCommand ? ['sh', '-c', deployment.service.startCommand] : undefined,
      });
      commandLogs += `Conteneur créé : ${container.id.slice(0, 12)}\n`;

      this.emitGatewayLog(deployment.id, 'Démarrage du conteneur...', 'info');
      await this.docker.startContainer(serverId, container.id);
      commandLogs += 'Conteneur démarré\n';

      await this.prisma.container.create({
        data: {
          dockerId: container.id,
          name: containerName,
          imageRef,
          status: ContainerStatus.RUNNING,
          deploymentId: deployment.id,
          serverId,
          serviceId: deployment.service?.id ?? null,
          serviceEnvId: deployment.serviceEnv?.id ?? null,
          lastSeenAt: new Date(),
        },
      });
      commandLogs += 'Enregistrement du conteneur en base de données\n';

      try {
        const healthLogs = await this.healthcheckService.runPostDeployHealthChecks({
          deploymentId: deployment.id,
          environmentDomain: null,
          serviceDomain: null,
          serverHost: server.host,
          appPort: publishPort,
          healthcheckPath: deployment.service?.healthcheckPath ?? null,
        });
        commandLogs += `${healthLogs}\n`;
      } catch (healthError) {
        // Health-check failed → stop the broken container so it does not linger
        // in RUNNING, then rethrow so the outer catch marks the deploy FAILED.
        this.emitGatewayLog(deployment.id, 'Health-check échoué : arrêt du conteneur défaillant.', 'error');
        await this.docker.stopContainer(serverId, container.id).catch((stopErr: unknown) => {
          this.logger.warn(
            `Could not stop unhealthy container ${container.id}: ${stopErr instanceof Error ? stopErr.message : 'unknown'}`,
          );
        });
        await this.prisma.container
          .updateMany({ where: { dockerId: container.id }, data: { status: ContainerStatus.EXITED } })
          .catch(() => undefined);
        throw healthError;
      }

      // Green is healthy → cut over: repoint the proxy rule, drain in-flight
      // requests on blue, then retire the old (blue) container(s).
      if (blueGreen) {
        commandLogs += await this.cutoverBlueGreen(
          deployment.serviceEnv?.id ?? null,
          serverId,
          container.id,
          publishPort,
        );
      }

      const imageDigest = await this.resolveImageDigest(serverId, imageRef);

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage: imageRef,
          imageSha: imageDigest ?? deployment.imageSha,
          conditions: this.buildSuccessConditions(envResolution.warnings),
          observedGeneration: 1,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}`.trim(),
        },
      });

      this.gateway.emitStatus({ deploymentId: finished.id, status: finished.status });
      this.gateway.emitFinished({ deploymentId: finished.id, status: finished.status, finishedAt: finished.finishedAt });

      return finished;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Échec du déploiement Docker';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          conditions: this.buildConditions('Degraded', 'DeployFailed', message),
          observedGeneration: 1,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}\n${message}`.trim(),
        },
      });

      this.gateway.emitStatus({ deploymentId: failed.id, status: failed.status });
      this.gateway.emitFinished({ deploymentId: failed.id, status: failed.status, finishedAt: failed.finishedAt });

      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Déploiement Docker échoué');
    }
  }

  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { resolvedRefs: true },
    });
    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    const refs = deployment.resolvedRefs as { serverId?: string; containerName?: string } | null;
    if (!refs?.serverId) throw new BadRequestException('Aucun serveur cible');
    const serverId = refs.serverId;
    const containers = await this.docker.listContainers(serverId, true);
    for (const c of containers) {
      if (refs.containerName && c.Names?.includes(`/${refs.containerName}`)) {
        const logs: string[] = [];
        for await (const chunk of this.docker.streamContainerLogs(serverId, c.Id, { follow: false, tail })) {
          logs.push(chunk.line);
        }
        return logs.join('\n');
      }
    }
    return '';
  }

  emitGatewayLog(deploymentId: string, rawMessage: string, fallbackLevel: 'info' | 'error'): void {
    const lines = rawMessage.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      this.gateway.emitLog({
        deploymentId,
        message: line,
        level: this.inferLogLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private inferLogLevel(message: string, fallbackLevel: 'info' | 'error'): DeploymentLogLevel {
    if (/error|fail|fatal|exception/i.test(message)) return 'error';
    if (/success|ok|done|completed|ready/i.test(message)) return 'success';
    return fallbackLevel;
  }

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
    const envLevel = deployment.serviceEnv?.environment ?? deployment.environment ?? null;
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
   * Ready condition for a successful deploy, plus a non-blocking EnvWarning
   * condition when some env/secret level could not be resolved.
   */
  private buildSuccessConditions(envWarnings: string[]): Prisma.InputJsonValue {
    const now = new Date().toISOString();
    const conditions: Array<Record<string, string>> = [
      {
        type: 'Ready',
        status: 'True',
        reason: 'DeploySucceeded',
        message: 'Déploiement Docker réussi.',
        lastTransitionAt: now,
      },
    ];
    if (envWarnings.length > 0) {
      conditions.push({
        type: 'EnvWarning',
        status: 'True',
        reason: 'EnvUnresolved',
        message: `Variables d'environnement non résolues: ${envWarnings.join('; ')}`.slice(0, 1000),
        lastTransitionAt: now,
      });
    }
    return conditions as unknown as Prisma.InputJsonValue;
  }

  private async resolveImageRef(
    deployment: { build?: { isLocalBuild?: boolean | null; imageSha?: string | null } | null; dockerImage?: string | null; service?: { id?: string | null } | null; project: { id: string }; branch: string },
    overrideImage?: string,
    _serverId?: string,
  ): Promise<string> {
    if (overrideImage) return overrideImage;
    if (deployment.dockerImage) return deployment.dockerImage;
    if (deployment.build?.imageSha) {
      return `platform/${deployment.project.id}:${deployment.build.imageSha}`;
    }
    return `platform/${deployment.project.id}:${deployment.branch || 'latest'}`;
  }

  private async resolveImageDigest(serverId: string, imageRef: string): Promise<string | null> {
    try {
      const info = await this.docker.inspectImage(serverId, imageRef);
      const digest = info?.RepoDigests?.[0];
      if (digest) {
        const parts = digest.split('@');
        return parts[1] ?? null;
      }
      return info?.Id ?? null;
    } catch {
      return null;
    }
  }

  // ─── DATABASE helpers ──────────────────────────────────────────────────────

  /**
   * Blue-green cut-over. Green is already running and healthy on its standby
   * port. We repoint the proxy rule to it, wait for blue to drain, then retire
   * the previous (blue) container(s) of this ServiceEnvironment.
   *
   * NOTE: seamless traffic hand-off requires a reverse proxy honouring
   * ProxyRule.targetPort. Until one is wired, this still delivers the core
   * blue-green safety guarantee: a broken image is caught on green and never
   * removes the live blue container (see the health-check failure path).
   */
  private async cutoverBlueGreen(
    serviceEnvId: string | null,
    serverId: string,
    greenDockerId: string,
    publishPort: number,
  ): Promise<string> {
    if (!serviceEnvId) return '[BLUE-GREEN] Pas de service-env, cut-over ignoré\n';

    let logs = '';
    // 1. Repoint the proxy rule(s) to the green port.
    const repointed = await this.prisma.proxyRule.updateMany({
      where: { serviceEnvId, serverId },
      data: { targetPort: publishPort },
    });
    if (repointed.count > 0) {
      logs += `[BLUE-GREEN] ${repointed.count} règle(s) proxy repointée(s) vers ${publishPort}\n`;
    }

    // 2. Drain: give in-flight requests on blue a moment to complete.
    await this.sleep(DockerDeployExecutorService.BLUE_GREEN_DRAIN_MS);

    // 3. Retire the old blue container(s).
    const blues = await this.prisma.container.findMany({
      where: { serviceEnvId, status: ContainerStatus.RUNNING, dockerId: { not: greenDockerId } },
      select: { id: true, dockerId: true, name: true },
    });
    for (const blue of blues) {
      try {
        await this.docker.removeContainer(serverId, blue.dockerId, true);
        await this.prisma.container.update({
          where: { id: blue.id },
          data: { status: ContainerStatus.EXITED },
        });
        logs += `[BLUE-GREEN] Ancien conteneur retiré : ${blue.name}\n`;
      } catch (error) {
        this.logger.warn(
          `Blue-green: could not remove old container ${blue.name}: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
        );
      }
    }
    return logs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getDatabaseContainerConfig(databaseType: ManagedServiceType): { port: number; dataPath: string } {
    switch (databaseType) {
      case 'POSTGRES': return { port: 5432, dataPath: '/var/lib/postgresql/data' };
      case 'MYSQL':    return { port: 3306, dataPath: '/var/lib/mysql' };
      case 'REDIS':    return { port: 6379, dataPath: '/data' };
      case 'MONGODB':  return { port: 27017, dataPath: '/data/db' };
      case 'RABBITMQ': return { port: 5672, dataPath: '/var/lib/rabbitmq' };
    }
  }

  private resolveDatabaseEnvVars(
    databaseType: ManagedServiceType,
    rawCredentials: Prisma.JsonValue | null | undefined,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    let creds: Record<string, string | undefined> = {};
    if (rawCredentials) {
      if (typeof rawCredentials === 'string') {
        try { creds = JSON.parse(rawCredentials); } catch { /* ignore */ }
      } else if (typeof rawCredentials === 'object' && rawCredentials !== null && !Array.isArray(rawCredentials)) {
        creds = rawCredentials as unknown as Record<string, string | undefined>;
      }
    }
    const user = creds.user;
    const password = creds.password;
    const dbName = creds.dbName;

    switch (databaseType) {
      case 'POSTGRES':
        result.POSTGRES_USER = user ?? 'app';
        result.POSTGRES_PASSWORD = password ?? 'changeme';
        result.POSTGRES_DB = dbName ?? 'app';
        break;
      case 'MYSQL':
        result.MYSQL_ROOT_PASSWORD = password ?? 'changeme';
        result.MYSQL_DATABASE = dbName ?? 'app';
        result.MYSQL_USER = user ?? 'app';
        result.MYSQL_PASSWORD = password ?? 'changeme';
        break;
      case 'REDIS':
        break;
      case 'MONGODB':
        result.MONGO_INITDB_ROOT_USERNAME = user ?? 'app';
        result.MONGO_INITDB_ROOT_PASSWORD = password ?? 'changeme';
        result.MONGO_INITDB_DATABASE = dbName ?? 'app';
        break;
      case 'RABBITMQ':
        result.RABBITMQ_DEFAULT_USER = user ?? 'app';
        result.RABBITMQ_DEFAULT_PASS = password ?? 'changeme';
        break;
    }
    return result;
  }
}
