import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContainerStatus, Deployment, DeploymentStatus, ManagedServiceType, Prisma, ServiceType } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from './deployments-healthcheck.service';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DockerDeployExecutorService {
  private readonly logger = new Logger(DockerDeployExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly docker: DockerApiService,
    private readonly gateway: DeploymentsGateway,
    private readonly healthcheckService: DeploymentsHealthcheckService,
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
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, port: true, env: true, dockerComposeContent: true, repoPath: true, branch: true, startCommand: true, type: true, databaseType: true, databaseVersion: true, databaseCredentials: true } },
        serviceEnv: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                env: true,
                servers: { where: { isActive: true, isVerified: true }, select: { id: true, name: true, host: true } },
              },
            },
          },
        },
        environment: { select: { id: true, name: true, env: true } },
        user: { select: { id: true, email: true, fullName: true, role: true } },
        build: { select: { id: true, imageSha: true, buildPack: true, isLocalBuild: true } },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');

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
    const envVars = this.resolveEnvVars(deployment);

    let commandLogs = '';
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
          PortBindings: { [`${servicePort}/tcp`]: [{ HostPort: String(servicePort) }] },
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

      const healthLogs = await this.healthcheckService.runPostDeployHealthChecks({
        deploymentId: deployment.id,
        environmentDomain: null,
        serviceDomain: null,
        serverHost: server.host,
        appPort: servicePort,
      });
      commandLogs += `${healthLogs}\n`;

      const imageDigest = await this.resolveImageDigest(serverId, imageRef);

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage: imageRef,
          imageSha: imageDigest ?? deployment.imageSha,
          conditions: this.buildConditions('Ready', 'DeploySucceeded', 'Déploiement Docker réussi.'),
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

  private resolveEnvVars(deployment: {
    project: { id: string; name: string };
    service?: { env?: string | null } | null;
    serviceEnv?: { env?: string | null; environment: { env?: string | null } } | null;
    environment?: { env?: string | null } | null;
  }): string[] {
    const merged: Record<string, string> = {};

    // 3 niveaux : Service.env + Environment.env + ServiceEnvironment.env
    if (deployment.service?.env) {
      try { Object.assign(merged, JSON.parse(deployment.service.env)); } catch { /* ignore */ }
    }
    const envFromServiceEnv = deployment.serviceEnv?.environment?.env ?? deployment.environment?.env;
    if (envFromServiceEnv) {
      try { Object.assign(merged, JSON.parse(envFromServiceEnv)); } catch { /* ignore */ }
    }
    if (deployment.serviceEnv?.env) {
      try { Object.assign(merged, JSON.parse(deployment.serviceEnv.env)); } catch { /* ignore */ }
    }

    return Object.entries(merged).map(([key, value]) => `${key}=${value}`);
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
