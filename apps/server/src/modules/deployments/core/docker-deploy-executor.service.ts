import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ContainerStatus,
  Deployment,
  DeploymentStatus,
  DeploymentStrategy,
  ManagedServiceType,
  Prisma,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  isNamespacedRepoPath,
  normalizeRepoPath,
} from '../../../core/utils/repo-path.util';
import { DockerApiService } from '../../../core/container-runtime/docker-api.service';
import { SshExecutorService } from '../../../core/ssh/ssh-executor.service';
import { CryptoService } from '../../../core/crypto/crypto.service';
import { ServersCryptoService } from '../../infrastructure/servers/services/servers-crypto.service';
import { ServerHostKeyService } from '../../infrastructure/servers/services/server-host-key.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from '../health/deployments-healthcheck.service';
import { EnvLevel, resolveEnvDetailed } from '../utils/env-resolver.util';
import {
  getLogContext,
  runWithLogContext,
  setLogContext,
} from '../../../core/logger/log-context';
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
    private readonly ssh: SshExecutorService,
    private readonly serversCrypto: ServersCryptoService,
    private readonly serverHostKeys: ServerHostKeyService,
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
      {
        correlationId: getLogContext().correlationId ?? randomUUID(),
        deploymentId,
      },
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
        service: {
          select: {
            id: true,
            name: true,
            port: true,
            env: true,
            secretsEnv: true,
            dockerComposeContent: true,
            repoPath: true,
            branch: true,
            startCommand: true,
            type: true,
            databaseType: true,
            databaseVersion: true,
            databaseCredentials: true,
            healthcheckPath: true,
            preDeployCommand: true,
            preDeployTimeout: true,
            shutdownTimeout: true,
            buildPack: true,
            dockerfile: true,
            nixpacksConfig: true,
            staticConfig: true,
            rootDir: true,
            volumes: { select: { name: true, mountPath: true } },
            provider: { select: { providerUrl: true, adminToken: true } },
          },
        },
        serviceEnv: {
          include: {
            environment: {
              select: {
                id: true,
                name: true,
                env: true,
                secretsEnv: true,
                servers: {
                  where: { isActive: true, isVerified: true },
                  select: { id: true, name: true, host: true },
                },
              },
            },
          },
        },
        environment: {
          select: { id: true, name: true, env: true, secretsEnv: true },
        },
        user: { select: { id: true, email: true, fullName: true, role: true } },
        build: {
          select: {
            id: true,
            imageSha: true,
            buildPack: true,
            isLocalBuild: true,
          },
        },
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement non trouvé');
    setLogContext({
      serviceEnvId: deployment.serviceEnv?.id,
      userId: deployment.user?.id,
    });

    // Résoudre le serveur : d'abord via serviceEnv, puis via resolvedRefs (backward compat)
    const servers = deployment.serviceEnv?.environment.servers ?? [];
    const resolvedRefs = deployment.resolvedRefs as {
      serverId?: string;
    } | null;
    const serverId = servers[0]?.id ?? resolvedRefs?.serverId;
    if (!serverId) throw new BadRequestException('Aucun serveur cible trouvé');

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
    });
    if (!server) throw new BadRequestException('Serveur cible introuvable');
    if (!server.isVerified)
      throw new BadRequestException('Serveur non vérifié');

    const serviceName = deployment.service?.name ?? deployment.project.name;
    const containerPrefix = `deploy-${deployment.project.name}-${serviceName}-`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-');
    const containerName = `${containerPrefix}${deployment.id.slice(0, 8)}`;
    let servicePort = deployment.service?.port ?? 3000;
    const envResolution = resolveEnvDetailed(this.buildEnvLevels(deployment));
    const envVars = envResolution.entries.map(
      (entry) => `${entry.key}=${entry.value}`,
    );

    let commandLogs = '';
    // Surface (do NOT swallow) any unresolved env/secret level so the operator
    // sees it in the live deploy log instead of getting a container missing
    // a critical variable silently. Non-blocking: the deploy continues.
    for (const warning of envResolution.warnings) {
      this.emitGatewayLog(
        deployment.id,
        `[ENV] Variable non résolue: ${warning}`,
        'error',
      );
      this.logger.warn(
        `Deployment ${deployment.id} env resolution warning: ${warning}`,
      );
      commandLogs += `[ENV] ${warning}\n`;
    }
    let dbVolumeName: string | undefined;
    let dbVolumePath: string | undefined;
    if (
      deployment.service?.type === ServiceType.DATABASE &&
      deployment.service.databaseType
    ) {
      const dbConfig = this.getDatabaseContainerConfig(
        deployment.service.databaseType,
      );
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
    // Domaine rattaché à ce service-env ? → routage Traefik : le conteneur ne
    // publie PAS de port hôte (Traefik le joint via le réseau 'web') → évite les
    // conflits de port entre services et permet plusieurs apps sur 80/443.
    const traefikServiceEnvId = deployment.serviceEnv?.id;
    const traefikDomain =
      traefikServiceEnvId && deployment.service?.type !== ServiceType.DATABASE
        ? (await this.prisma.domain.findFirst({
            where: { serviceEnvId: traefikServiceEnvId },
            orderBy: { createdAt: 'desc' },
            select: { name: true },
          }))?.name ?? null
        : null;
    const useTraefik = !!traefikDomain;

    const blueGreen =
      deployment.strategy === DeploymentStrategy.BLUE_GREEN &&
      deployment.service?.type !== ServiceType.DATABASE &&
      !useTraefik;
    const publishPort = blueGreen
      ? servicePort + DockerDeployExecutorService.BLUE_GREEN_PORT_OFFSET
      : servicePort;
    if (blueGreen) {
      this.emitGatewayLog(
        deployment.id,
        `[BLUE-GREEN] Conteneur green sur le port ${publishPort} (blue reste actif).`,
        'info',
      );
      commandLogs += `[BLUE-GREEN] Green publié sur ${publishPort}\n`;
    }

    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        conditions: this.buildConditions(
          'Progressing',
          'DockerDeploy',
          'Déploiement Docker en cours.',
        ),
        logs: `${deployment.logs ?? ''}\nDéploiement Docker en cours...`.trim(),
      },
    });

    try {
      const isLocalBuild = !!deployment.build?.isLocalBuild;
      const imageRef = await this.resolveImageRef(
        deployment,
        overrideImage,
        serverId,
      );
      commandLogs += `Image résolue : ${imageRef}\n`;

      if (isLocalBuild) {
        // Build the image directly on the server via SSH.
        commandLogs += await this.buildLocalImage(
          deployment,
          imageRef,
          serverId,
          server,
        );
      } else {
        this.emitGatewayLog(
          deployment.id,
          `Pull de l'image ${imageRef}...`,
          'info',
        );
        await this.docker.pullImage(serverId, imageRef);
        commandLogs += `Image pullée : ${imageRef}\n`;
      }

      // Remove ALL previous containers of THIS service (name = prefix + a past
      // deploy id) so a redeploy never collides on the published port.
      const existing = await this.docker.listContainers(serverId, true);

      // ── Host-port conflict guard ────────────────────────────────────────
      // En mode port hôte (sans Traefik), deux services ne peuvent pas partager
      // le même port. On détecte le conflit AVANT de toucher aux conteneurs pour
      // lever une erreur claire (au lieu du « Bind for 0.0.0.0:<port> failed:
      // port is already allocated » brut de Docker) ET sans couper le service
      // déjà en place. Les conteneurs de CE service (même préfixe) sont exclus :
      // un redeploy réutilise son propre port.
      const publishesHostPort =
        !useTraefik &&
        deployment.service?.type !== 'WORKER' &&
        deployment.service?.type !== 'CRON';
      if (publishesHostPort) {
        const conflict = existing.find(
          (c) =>
            (c.Ports ?? []).some((p) => p.PublicPort === publishPort) &&
            !(c.Names ?? []).some((n) =>
              n.replace(/^\//, '').startsWith(containerPrefix),
            ),
        );
        if (conflict) {
          const who = (conflict.Names?.[0] ?? conflict.Id).replace(/^\//, '');
          throw new BadRequestException(
            `Le port hôte ${publishPort} est déjà utilisé sur ce serveur par le ` +
              `conteneur "${who}". Choisis un autre port pour ce service, ou ` +
              `attribue-lui un domaine (routage Traefik, sans port hôte).`,
          );
        }
      }

      const stale = existing.filter((c) =>
        (c.Names ?? []).some((n) =>
          n.replace(/^\//, '').startsWith(containerPrefix),
        ),
      );
      for (const old of stale) {
        const oldName = (old.Names?.[0] ?? old.Id).replace(/^\//, '');
        this.emitGatewayLog(
          deployment.id,
          `Suppression de l'ancien conteneur ${oldName}...`,
          'info',
        );
        await this.docker.removeContainer(serverId, old.Id, true);
        commandLogs += `Ancien conteneur supprimé : ${old.Id.slice(0, 12)}\n`;
      }

      // ── Pre-deploy command ──────────────────────────────────────────────
      if (deployment.service?.preDeployCommand) {
        const preCmd = deployment.service.preDeployCommand;
        const preTimeout = deployment.service.preDeployTimeout ?? 120;
        this.emitGatewayLog(
          deployment.id,
          `[PRE-DEPLOY] Running: ${preCmd}`,
          'info',
        );
        const preContainer = await this.docker.createContainer(serverId, {
          Image: imageRef,
          name: `pre-${containerName}`,
          Env: envVars,
          HostConfig: { AutoRemove: true },
          Cmd: ['sh', '-c', preCmd],
        });
        await this.docker.startContainer(serverId, preContainer.id);
        // Poll until the pre-deploy container exits.
        const exitCode = await this.waitForContainerExit(
          serverId,
          preContainer.id,
          preTimeout,
        );
        if (exitCode !== 0) {
          throw new BadRequestException(
            `Pre-deploy command failed with exit code ${String(exitCode)}: ${preCmd}`,
          );
        }
        commandLogs += `[PRE-DEPLOY] Completed successfully.\n`;
        this.emitGatewayLog(
          deployment.id,
          `[PRE-DEPLOY] Completed successfully.`,
          'info',
        );
      }

      // ── Ensure per-project Docker network exists ────────────────────────
      const projectNetwork = `project-${deployment.project.id}`;
      try {
        await this.docker.createNetwork(serverId, projectNetwork);
        commandLogs += `Network ${projectNetwork} ready.\n`;
      } catch {
        // Network may already exist — not an error.
      }

      // ── Resolve app volumes ─────────────────────────────────────────────
      const appVolumes = deployment.service?.volumes ?? [];
      const appBinds: string[] = appVolumes
        .filter((v): v is { name: string; mountPath: string } => !!v.mountPath)
        .map((v) => `${v.name}:${v.mountPath}`);

      this.emitGatewayLog(deployment.id, 'Création du conteneur...', 'info');
      const stopTimeout = deployment.service?.shutdownTimeout ?? 30;
      const container = await this.docker.createContainer(serverId, {
        Image: imageRef,
        name: containerName,
        Env: envVars,
        ExposedPorts:
          deployment.service?.type !== 'WORKER' &&
          deployment.service?.type !== 'CRON'
            ? { [`${servicePort}/tcp`]: {} }
            : undefined,
        StopTimeout: stopTimeout,
        HostConfig: {
          // En mode Traefik : aucun port hôte publié (Traefik route via 'web').
          PortBindings:
            useTraefik ||
            deployment.service?.type === 'WORKER' ||
            deployment.service?.type === 'CRON'
              ? {}
              : { [`${servicePort}/tcp`]: [{ HostPort: String(publishPort) }] },
          RestartPolicy: {
            Name: deployment.service?.type === 'CRON' ? 'no' : 'unless-stopped',
          },
          AutoRemove: false,
          Binds: [
            ...(dbVolumeName && dbVolumePath
              ? [`${dbVolumeName}:${dbVolumePath}`]
              : []),
            ...appBinds,
          ],
          NetworkMode: projectNetwork,
        },
        Cmd: deployment.service?.startCommand
          ? ['sh', '-c', deployment.service.startCommand]
          : undefined,
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
        if (useTraefik) {
          // Mode Traefik : pas de port hôte → on vérifie que le conteneur tourne
          // (Traefik effectue le vrai routage/santé via 'web'). Petite attente
          // anti-flap avant l'inspection.
          await this.sleep(3000);
          const info = await this.docker.inspectContainer(serverId, container.id);
          if (info.State.Status !== 'running') {
            throw new BadRequestException(
              `Conteneur non démarré (état: ${info.State.Status})`,
            );
          }
          commandLogs += `Conteneur en cours d'exécution (mode Traefik, sans port hôte).\n`;
        } else {
          const healthLogs =
            await this.healthcheckService.runPostDeployHealthChecks({
              deploymentId: deployment.id,
              environmentDomain: null,
              serviceDomain: null,
              serverHost: server.host,
              serverId,
              appPort: publishPort,
              healthcheckPath: deployment.service?.healthcheckPath ?? null,
            });
          commandLogs += `${healthLogs}\n`;
        }
      } catch (healthError) {
        // Health-check failed → stop the broken container so it does not linger
        // in RUNNING, then rethrow so the outer catch marks the deploy FAILED.
        this.emitGatewayLog(
          deployment.id,
          'Health-check échoué : arrêt du conteneur défaillant.',
          'error',
        );
        await this.docker
          .stopContainer(serverId, container.id)
          .catch((stopErr: unknown) => {
            this.logger.warn(
              `Could not stop unhealthy container ${container.id}: ${stopErr instanceof Error ? stopErr.message : 'unknown'}`,
            );
          });
        await this.prisma.container
          .updateMany({
            where: { dockerId: container.id },
            data: { status: ContainerStatus.EXITED },
          })
          .catch(() => undefined);
        throw healthError;
      }

      // ── Reverse-proxy Traefik : route le domaine (résolu en amont) vers le
      // conteneur (réseau 'web' + config dynamique fichier).
      if (useTraefik && traefikDomain && traefikServiceEnvId) {
        try {
          commandLogs += await this.applyTraefikRoute(
            serverId,
            server,
            traefikServiceEnvId,
            traefikDomain,
            containerName,
            servicePort,
            deployment.id,
          );
        } catch (proxyError) {
          const msg = proxyError instanceof Error ? proxyError.message : 'unknown';
          this.emitGatewayLog(
            deployment.id,
            `[TRAEFIK] Route non configurée: ${msg}`,
            'error',
          );
          commandLogs += `[TRAEFIK] Route non configurée: ${msg}\n`;
        }
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
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: finished.id,
        status: finished.status,
      });
      this.gateway.emitFinished({
        deploymentId: finished.id,
        status: finished.status,
        finishedAt: finished.finishedAt,
      });

      return finished;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Échec du déploiement Docker';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          conditions: this.buildConditions('Degraded', 'DeployFailed', message),
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${commandLogs}\n${message}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: failed.id,
        status: failed.status,
      });
      this.gateway.emitFinished({
        deploymentId: failed.id,
        status: failed.status,
        finishedAt: failed.finishedAt,
      });

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
    const refs = deployment.resolvedRefs as {
      serverId?: string;
      containerName?: string;
    } | null;
    if (!refs?.serverId) throw new BadRequestException('Aucun serveur cible');
    const serverId = refs.serverId;
    const containers = await this.docker.listContainers(serverId, true);
    for (const c of containers) {
      if (refs.containerName && c.Names?.includes(`/${refs.containerName}`)) {
        const logs: string[] = [];
        for await (const chunk of this.docker.streamContainerLogs(
          serverId,
          c.Id,
          { follow: false, tail },
        )) {
          logs.push(chunk.line);
        }
        return logs.join('\n');
      }
    }
    return '';
  }

  /**
   * Build a Docker image locally on the target server via SSH.
   * Supports: DOCKERFILE (docker build), NIXPACKS (nixpacks build),
   * STATIC (nginx container from plain files).
   * Returns a log string to append to commandLogs.
   */
  private async buildLocalImage(
    deployment: {
      id: string;
      branch: string;
      project: { id: string; name: string };
      service?: {
        repoPath?: string | null;
        rootDir?: string | null;
        dockerfile?: string | null;
        buildPack?: string | null;
        nixpacksConfig?: unknown;
        provider?: { providerUrl: string; adminToken?: string | null } | null;
      } | null;
      build?: { buildPack?: string | null } | null;
    },
    imageTag: string,
    serverId: string,
    server: { host: string; port: number; username: string; sshKey: string },
  ): Promise<string> {
    const svc = deployment.service;
    if (!svc?.repoPath) {
      throw new BadRequestException(
        'Local build requires service.repoPath to be set',
      );
    }

    const buildPack = (
      svc.buildPack ??
      deployment.build?.buildPack ??
      'DOCKERFILE'
    )
      .toString()
      .toUpperCase();
    const providerUrl = svc.provider?.providerUrl ?? '';
    const token = svc.provider?.adminToken
      ? this.crypto.decrypt(svc.provider.adminToken)
      : '';
    const repoPath = normalizeRepoPath(svc.repoPath);
    if (!isNamespacedRepoPath(repoPath)) {
      throw new BadRequestException(
        `Invalid repository path "${repoPath}": expected "namespace/project" ` +
          `(e.g. "my-group/my-repo"). The group/owner segment is missing, so ` +
          `the clone URL would point to a non-existent namespace.`,
      );
    }
    // Build a HTTPS clone URL with embedded token for authenticated access.
    const cloneUrl =
      token && providerUrl
        ? `${providerUrl.replace(/\/$/, '')}/${repoPath}.git`.replace(
            'https://',
            `https://oauth2:${token}@`,
          )
        : `${providerUrl.replace(/\/$/, '')}/${repoPath}.git`;
    const branch = deployment.branch || 'main';
    const rootDir = svc.rootDir?.replace(/^\//, '') ?? '.';
    const workDir = `/tmp/build-${deployment.id.slice(0, 8)}`;

    let logs = '';
    this.emitGatewayLog(
      deployment.id,
      `[LOCAL BUILD] Cloning ${repoPath} branch ${branch}...`,
      'info',
    );

    const pinnedHost = await this.serverHostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    const conn = await this.ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: this.serversCrypto.decrypt(server.sshKey),
      expectedHostKey: pinnedHost.keyBase64,
    });

    try {
      const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

      // Clone
      await this.ssh.execOrThrow(
        conn,
        `rm -rf ${q(workDir)} && git clone --depth 1 -b ${q(branch)} ${q(cloneUrl)} ${q(workDir)}`,
        'Git clone failed',
      );
      logs += `[LOCAL BUILD] Cloned ${repoPath}@${branch}\n`;
      this.emitGatewayLog(deployment.id, `[LOCAL BUILD] Clone OK`, 'info');

      const buildCtx = rootDir === '.' ? workDir : `${workDir}/${rootDir}`;

      // Auto-fallback: Nixpacks refuses apps it doesn't recognize (e.g. a
      // static nginx site) with "unable to generate a build plan". If the repo
      // already ships a Dockerfile, prefer it — this mirrors how Coolify/Dokploy
      // auto-detect the build pack and avoids a confusing build failure.
      let effectiveBuildPack = buildPack;
      if (effectiveBuildPack === 'NIXPACKS' && !svc.dockerfile) {
        const probe = await this.ssh.exec(
          conn,
          `test -f ${q(`${buildCtx}/Dockerfile`)} && echo yes || echo no`,
        );
        if (probe.stdout.trim() === 'yes') {
          effectiveBuildPack = 'DOCKERFILE';
          const msg =
            '[LOCAL BUILD] Build pack NIXPACKS demandé mais un Dockerfile est ' +
            'présent dans le dépôt → bascule automatique sur le build Dockerfile.';
          logs += msg + '\n';
          this.emitGatewayLog(deployment.id, msg, 'info');
        }
      }

      if (effectiveBuildPack === 'NIXPACKS') {
        // nixpacks must be installed on the server
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && nixpacks build . --name ${q(imageTag)}`,
          'Nixpacks build failed',
        );
        logs += `[LOCAL BUILD] Nixpacks build OK → ${imageTag}\n`;
      } else if (effectiveBuildPack === 'STATIC') {
        // Wrap static files in an nginx container
        const nginxConf = `server { listen 80; root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; }`;
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && printf 'FROM nginx:alpine\\nCOPY . /usr/share/nginx/html\\n' > Dockerfile.static && ` +
            `printf '%s' ${q(nginxConf)} > nginx.conf.tmp && ` +
            `docker build -f Dockerfile.static -t ${q(imageTag)} .`,
          'Static build failed',
        );
        logs += `[LOCAL BUILD] Static site packaged → ${imageTag}\n`;
      } else {
        // Default: DOCKERFILE
        const dockerfilePath = svc.dockerfile
          ? 'Dockerfile.custom'
          : 'Dockerfile';
        if (svc.dockerfile) {
          await this.ssh.execOrThrow(
            conn,
            `printf '%s' ${q(svc.dockerfile)} > ${q(`${buildCtx}/Dockerfile.custom`)}`,
            'Failed to write custom Dockerfile',
          );
        }
        await this.ssh.execOrThrow(
          conn,
          `cd ${q(buildCtx)} && docker build -f ${q(dockerfilePath)} -t ${q(imageTag)} .`,
          'Docker build failed',
        );
        logs += `[LOCAL BUILD] Docker build OK → ${imageTag}\n`;
      }
      this.emitGatewayLog(
        deployment.id,
        `[LOCAL BUILD] Image built: ${imageTag}`,
        'info',
      );
    } finally {
      // Cleanup workspace (best-effort)
      await this.ssh.exec(
        conn,
        `rm -rf ${`'${workDir.replace(/'/g, "'\\''")}'`}`,
      );
      await conn.dispose();
    }
    return logs;
  }

  /**
   * Branche le conteneur sur le réseau partagé 'web' et écrit la config dynamique
   * Traefik (provider fichier) routant Host(domain) → http://<conteneur>:<port>
   * en HTTPS (résolveur Let's Encrypt 'le'). Traefik recharge à chaud.
   * Indépendant de la version du daemon Docker (cf. mémoire traefik-phase2).
   */
  private async applyTraefikRoute(
    serverId: string,
    server: { host: string; port: number; username: string; sshKey: string },
    serviceEnvId: string,
    domain: string,
    containerName: string,
    servicePort: number,
    deploymentId: string,
  ): Promise<string> {
    // 1. Rendre le conteneur joignable par Traefik (réseau partagé 'web').
    await this.docker.createNetwork(serverId, 'web').catch(() => undefined);
    await this.docker.connectNetwork(serverId, 'web', containerName);

    // 2. Config dynamique Traefik (encodée base64 pour éviter tout souci de
    //    quoting — la règle Host contient des backticks).
    const safeId = serviceEnvId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const yaml = [
      'http:',
      '  routers:',
      `    ${safeId}:`,
      `      rule: "Host(\`${domain}\`)"`,
      '      entryPoints: ["websecure"]',
      `      service: ${safeId}`,
      '      tls:',
      '        certResolver: le',
      '  services:',
      `    ${safeId}:`,
      '      loadBalancer:',
      '        servers:',
      `          - url: "http://${containerName}:${String(servicePort)}"`,
      '',
    ].join('\n');
    const b64 = Buffer.from(yaml, 'utf8').toString('base64');

    const pinnedHost = await this.serverHostKeys.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });
    const conn = await this.ssh.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      privateKey: this.serversCrypto.decrypt(server.sshKey),
      expectedHostKey: pinnedHost.keyBase64,
    });
    try {
      await this.ssh.execOrThrow(
        conn,
        `sudo mkdir -p /opt/traefik/dynamic && echo ${b64} | base64 -d | sudo tee /opt/traefik/dynamic/${safeId}.yml >/dev/null`,
        'Écriture de la route Traefik échouée',
      );
    } finally {
      await conn.dispose();
    }
    this.emitGatewayLog(
      deploymentId,
      `[TRAEFIK] Route ${domain} → ${containerName}:${String(servicePort)}`,
      'info',
    );
    return `[TRAEFIK] Route HTTPS configurée : https://${domain}\n`;
  }

  /**
   * Poll Docker inspect until the given container has exited, then return the
   * exit code. Times out after `timeoutSec` seconds and returns -1.
   */
  private async waitForContainerExit(
    serverId: string,
    containerId: string,
    timeoutSec: number,
  ): Promise<number> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      try {
        const info = await this.docker.inspectContainer(serverId, containerId);
        if (info.State.Status === 'exited' || info.State.Status === 'dead') {
          return info.State.ExitCode ?? -1;
        }
      } catch {
        return -1;
      }
      await new Promise<void>((r) => setTimeout(r, 2000));
    }
    return -1;
  }

  emitGatewayLog(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    const lines = rawMessage
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      this.gateway.emitLog({
        deploymentId,
        message: line,
        level: this.inferLogLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private inferLogLevel(
    message: string,
    fallbackLevel: 'info' | 'error',
  ): DeploymentLogLevel {
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
        message:
          `Variables d'environnement non résolues: ${envWarnings.join('; ')}`.slice(
            0,
            1000,
          ),
        lastTransitionAt: now,
      });
    }
    return conditions as unknown as Prisma.InputJsonValue;
  }

  private async resolveImageRef(
    deployment: {
      build?: {
        isLocalBuild?: boolean | null;
        imageSha?: string | null;
        buildPack?: string | null;
      } | null;
      dockerImage?: string | null;
      service?: { id?: string | null; name?: string | null } | null;
      project: { id: string; name: string };
      branch: string;
    },
    overrideImage?: string,
    _serverId?: string,
  ): Promise<string> {
    if (overrideImage) return overrideImage;
    if (deployment.dockerImage) return deployment.dockerImage;

    // Local builds produce an image tagged only on the server — no registry.
    if (deployment.build?.isLocalBuild) {
      const safeName = (deployment.service?.name ?? deployment.project.name)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');
      const safeProject = deployment.project.name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');
      return `local/${safeProject}-${safeName}:${deployment.branch || 'latest'}`;
    }

    if (deployment.build?.imageSha) {
      return `platform/${deployment.project.id}:${deployment.build.imageSha}`;
    }
    return `platform/${deployment.project.id}:${deployment.branch || 'latest'}`;
  }

  private async resolveImageDigest(
    serverId: string,
    imageRef: string,
  ): Promise<string | null> {
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
    if (!serviceEnvId)
      return '[BLUE-GREEN] Pas de service-env, cut-over ignoré\n';

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
      where: {
        serviceEnvId,
        status: ContainerStatus.RUNNING,
        dockerId: { not: greenDockerId },
      },
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

  private getDatabaseContainerConfig(databaseType: ManagedServiceType): {
    port: number;
    dataPath: string;
  } {
    switch (databaseType) {
      case 'POSTGRES':
        return { port: 5432, dataPath: '/var/lib/postgresql/data' };
      case 'MYSQL':
        return { port: 3306, dataPath: '/var/lib/mysql' };
      case 'REDIS':
        return { port: 6379, dataPath: '/data' };
      case 'MONGODB':
        return { port: 27017, dataPath: '/data/db' };
      case 'RABBITMQ':
        return { port: 5672, dataPath: '/var/lib/rabbitmq' };
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
        try {
          creds = JSON.parse(rawCredentials);
        } catch {
          /* ignore */
        }
      } else if (
        typeof rawCredentials === 'object' &&
        rawCredentials !== null &&
        !Array.isArray(rawCredentials)
      ) {
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
