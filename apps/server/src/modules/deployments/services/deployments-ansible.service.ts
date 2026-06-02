import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Deployment, DeploymentStatus } from '@prisma/client';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PrismaService } from '../../../core/database/prisma.service';
import { ConfigsService } from '../../projects/app-configs/configs.service';
import { EnvConfigsService } from '../../projects/app-configs/env-configs.service';
import { GitlabService } from '../../git-providers/gitlab/gitlab.service';
import {
  ServerHostKeyService,
  ServersCryptoService,
} from '../../servers/services';
import { DockerImageService } from '../../build/image/docker-image.service';
import { DeploymentsGateway } from '../gateways/deployments.gateway';
import { DeploymentsHealthcheckService } from './deployments-healthcheck.service';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DeploymentsAnsibleService {
  private readonly logger = new Logger(DeploymentsAnsibleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly configsService: ConfigsService,
    private readonly envConfigsService: EnvConfigsService,
    private readonly gitlabService: GitlabService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly serverHostKeyService: ServerHostKeyService,
    private readonly dockerService: DockerImageService,
    private readonly gateway: DeploymentsGateway,
    private readonly healthcheckService: DeploymentsHealthcheckService,
  ) {}

  async deployWithAnsible(
    deploymentId: string,
    overrideImage?: string,
  ): Promise<Deployment> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        project: {
          include: {
            gitlabConfig: true,
          },
        },
        service: true,
        environment: {
          include: {
            server: true,
            serviceTargets: {
              include: {
                server: true,
              },
            },
          },
        },
        user: true,
      },
    });

    if (!deployment) {
      throw new BadRequestException('Déploiement non trouvé');
    }

    const serviceTarget = deployment.serviceId
      ? deployment.environment.serviceTargets.find(
          (target) => target.serviceId === deployment.serviceId,
        )
      : null;
    const server = serviceTarget?.server ?? deployment.environment.server;
    const decryptedSshKey = this.decryptSshKey(server.sshKey);

    if (!server.isVerified) {
      throw new BadRequestException('Serveur non vérifié');
    }

    const ssh = new NodeSSH();
    try {
      const pinnedHost = await this.serverHostKeyService.resolveForConnection(
        server,
        {
          allowTrustOnFirstUse: false,
        },
      );
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedSshKey,
        readyTimeout: 10_000,
        hostVerifier: this.serverHostKeyService.hostVerifier(
          pinnedHost.keyBase64,
        ),
      });
    } catch {
      throw new BadRequestException(
        'Connexion SSH échouée vers le serveur cible',
      );
    } finally {
      ssh.dispose();
    }

    // Use environment-specific configs (env overrides override global)
    const allConfigs = await this.envConfigsService.getMergedDecrypted(
      deployment.projectId,
      deployment.environmentId,
      deployment.userId,
      deployment.user.role,
    );

    const tmpPath = await mkdtemp(join(tmpdir(), 'deploy-ansible-'));
    const inventoryPath = join(tmpPath, 'inventory.ini');
    const varsPath = join(tmpPath, 'vars.json');
    const privateKeyPath = `/tmp/deploy_key_${deployment.id}`;

    const playbookRoot = this.resolvePlaybookRoot();
    const isComposeDeployment =
      (deployment.dockerImage ?? '').startsWith('compose://');

    // Select playbook based on deployment strategy
    let playbookFileName: string;
    if (isComposeDeployment) {
      // Docker Compose: deploy via docker-compose.yml on target server
      playbookFileName = 'deploy-compose.yml';
    } else if (deployment.buildMode === 'LOCAL') {
      // CAS 5: Build local sur VPS
      playbookFileName = 'deploy-local-build.yml';
    } else if (deployment.strategy === 'BLUE_GREEN') {
      // Blue-Green zero-downtime deployment
      playbookFileName = 'deploy-blue-green.yml';
    } else {
      // Default: Standard deployment
      playbookFileName = 'deploy.yml';
    }
    
    const playbookPath = join(playbookRoot, playbookFileName);
    this.logger.log(
      `[Deployment ${deployment.id}] Using playbook: ${playbookFileName} (strategy=${deployment.strategy}, buildMode=${deployment.buildMode})`,
    );

    const serviceName = deployment.service?.name;
    const containerName = this.slugify(
      serviceName
        ? `${deployment.project.name}-${serviceName}`
        : deployment.project.name,
    );
    const repositoryId = deployment.service?.gitlabProjectId
      ? Number(deployment.service.gitlabProjectId)
      : undefined;
    let dockerImage: string;
    if (isComposeDeployment) {
      // Skip image build/pull — docker-compose handles its own images
      dockerImage = deployment.dockerImage ?? `compose://${deployment.project.name}`;
    } else {
      dockerImage =
        overrideImage ??
        deployment.dockerImage ??
        (await this.dockerService.buildDockerImage({
          gitlabConfig: deployment.project.gitlabConfig,
          projectName: serviceName
            ? `${deployment.project.name}-${serviceName}`
            : deployment.project.name,
          branch: deployment.branch,
          repositoryId,
        }));
    }

    const registryAuth = deployment.project.gitlabConfig
      ? this.gitlabService.resolveRegistryCredentials(
          deployment.project.gitlabConfig,
        )
      : null;

    const inventoryContent =
      `[targets]\n` +
      `${server.host} ansible_user=${server.username} ansible_port=${String(server.port)}\n`;

    const varsContent: Record<string, unknown> = {
      app_name: serviceName
        ? `${deployment.project.name}-${serviceName}`
        : deployment.project.name,
      app_port: serviceTarget?.port ?? deployment.project.port,
      container_name: containerName,
      docker_image: dockerImage,
      registry_url: registryAuth?.registryUrl ?? '',
      registry_username: registryAuth?.username ?? '',
      registry_password: registryAuth?.password ?? '',
      domain: serviceTarget?.domain ?? deployment.environment.domain ?? '',
      env_vars: allConfigs,
    };

    if (isComposeDeployment) {
      // Note: project.dockerComposeContent n'existe pas encore sur le modèle Prisma.
      // Le contenu doit être fourni via override (clé étendue à activer côté UI/DB).
      const composeContent =
        (deployment.project as { dockerComposeContent?: string | null })
          .dockerComposeContent ?? '';
      const envContent = Object.entries(allConfigs)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('\n');
      varsContent.compose_content = composeContent;
      varsContent.env_content = envContent;
    }

    await writeFile(inventoryPath, inventoryContent, 'utf-8');
    await writeFile(varsPath, JSON.stringify(varsContent, null, 2), 'utf-8');
    await writeFile(privateKeyPath, decryptedSshKey, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    await chmod(privateKeyPath, 0o600);

    const currentLogs = deployment.logs ?? '';
    await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: `${currentLogs}\nExécution Ansible en cours...`.trim(),
      },
    });

    let commandLogs = '';
    try {
      commandLogs = await this.runAnsible(
        playbookPath,
        inventoryPath,
        varsPath,
        privateKeyPath,
        deployment.id,
      );

      const healthCheckLogs = await this.healthcheckService.runPostDeployHealthChecks({
        deploymentId: deployment.id,
        environmentDomain: deployment.environment.domain,
        serviceDomain: serviceTarget?.domain,
        serverHost: server.host,
        appPort: serviceTarget?.port ?? deployment.project.port,
      });

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage,
          finishedAt: new Date(),
          logs: `${currentLogs}\n${commandLogs}\n${healthCheckLogs}`.trim(),
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
        error instanceof Error
          ? error.message
          : "Échec lors de l'exécution du playbook Ansible";

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          logs: `${currentLogs}\n${commandLogs}\n${message}`.trim(),
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

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Déploiement Ansible échoué');
    } finally {
      await Promise.all([
        rm(tmpPath, { recursive: true, force: true }),
        rm(privateKeyPath, { force: true }),
      ]);
    }
  }

  async runAnsible(
    playbookPath: string,
    inventoryPath: string,
    varsPath: string,
    privateKeyPath: string,
    deploymentId: string,
  ): Promise<string> {
    const timeoutMs = this.resolveDeploymentTimeoutMs();
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      let settled = false;
      const ansiblePlaybookCommand = this.resolveAnsiblePlaybookCommand();
      const child = spawn(
        ansiblePlaybookCommand,
        [
          playbookPath,
          '-i',
          inventoryPath,
          '--private-key',
          privateKeyPath,
          '--ssh-common-args',
          this.resolveSshCommonArgs(),
          '--extra-vars',
          `@${varsPath}`,
        ],
        {
          env: {
            ...process.env,
            ANSIBLE_HOST_KEY_CHECKING: 'True',
          },
        },
      );

      let output = '';
      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutRef);
        rejectPromise(error);
      };
      const resolveOnce = (value: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutRef);
        resolvePromise(value);
      };
      const forceKill = () => {
        if (!child.killed) {
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 5_000);
        }
      };
      const timeoutRef = setTimeout(() => {
        this.emitGatewayLog(
          deploymentId,
          `Ansible deployment timeout (${String(timeoutMs)}ms). Stopping process...`,
          'error',
        );
        forceKill();
        rejectOnce(
          new Error(`ansible-playbook timeout after ${String(timeoutMs)}ms`),
        );
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        const message = chunk.toString();
        output += message;
        this.emitGatewayLog(deploymentId, message, 'info');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString();
        output += message;
        this.emitGatewayLog(deploymentId, message, 'error');
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolveOnce(output);
          return;
        }
        rejectOnce(
          new Error(`ansible-playbook a échoué (code ${String(code)})`),
        );
      });

      child.on('error', (error) => {
        this.logger.error(error);
        rejectOnce(error);
      });
    });
  }

  private resolveDeploymentTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('DEPLOYMENT_ANSIBLE_TIMEOUT_MS')
    );
    if (Number.isFinite(raw) && raw >= 60_000) {
      return Math.floor(raw);
    }
    return 900_000;
  }

  resolveAnsiblePlaybookCommand(): string {
    const configuredVenvPath = this.configService.get<string>(
      'ANSIBLE_VENV_PATH'
    )?.trim();
    if (!configuredVenvPath) {
      return 'ansible-playbook';
    }

    const absoluteVenvPath = resolve(configuredVenvPath);
    const venvBinaryPath = join(absoluteVenvPath, 'bin', 'ansible-playbook');
    if (existsSync(venvBinaryPath)) {
      return venvBinaryPath;
    }

    this.logger.warn(
      `ANSIBLE_VENV_PATH défini mais ansible-playbook introuvable (${venvBinaryPath}). Utilisation du binaire global.`,
    );
    return 'ansible-playbook';
  }

  resolvePlaybookRoot(): string {
    const configuredPath = this.configService.get<string>(
      'ANSIBLE_PLAYBOOKS_PATH'
    )?.trim();
    if (configuredPath) {
      const absoluteConfigured = resolve(configuredPath);
      if (existsSync(absoluteConfigured)) {
        return absoluteConfigured;
      }
      throw new BadRequestException(
        `ANSIBLE_PLAYBOOKS_PATH introuvable: ${absoluteConfigured}`,
      );
    }

    const defaultDevopsPath = resolve(
      process.cwd(),
      '../devops/ansible/playbooks',
    );

    if (existsSync(defaultDevopsPath)) {
      return defaultDevopsPath;
    }

    throw new BadRequestException(
      `Répertoire Ansible introuvable. Configurez ANSIBLE_PLAYBOOKS_PATH ou créez ${defaultDevopsPath}`,
    );
  }

  decryptSshKey(encryptedValue: string): string {
    return this.serversCryptoService.decrypt(encryptedValue);
  }

  async getContainerLogs(deploymentId: string, tail = 300): Promise<string> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: {
        environment: {
          include: {
            server: true,
            serviceTargets: { include: { server: true } },
          },
        },
        service: true,
      },
    });

    if (!deployment) throw new BadRequestException('Déploiement introuvable');

    const serviceTarget = deployment.serviceId
      ? deployment.environment.serviceTargets.find((t) => t.serviceId === deployment.serviceId)
      : null;
    const server = serviceTarget?.server ?? deployment.environment.server;

    if (!server) throw new BadRequestException('Aucun serveur associé à ce déploiement');
    if (!server.sshKey) throw new BadRequestException('Aucune clé SSH configurée sur ce serveur');

    const privateKey = this.decryptSshKey(server.sshKey);

    const pinnedHost = await this.serverHostKeyService.resolveForConnection(server, {
      allowTrustOnFirstUse: false,
    });

    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey,
        readyTimeout: 10_000,
        hostVerifier: this.serverHostKeyService.hostVerifier(pinnedHost.keyBase64),
      });

      // Find container name: look for container name matching deployment id or project/service name
      const containerName = deployment.serviceId
        ? `${deployment.serviceId}`
        : deploymentId;

      // Try to find matching container
      const psResult = await ssh.execCommand(
        `docker ps -a --format '{{.Names}}' | grep -i '${containerName}' | head -1`,
      );

      let container = psResult.stdout.trim();
      if (!container) {
        // Fallback: list all containers
        const allPs = await ssh.execCommand(`docker ps -a --format '{{.Names}}'`);
        container = allPs.stdout.trim().split('\n')[0] ?? '';
      }

      if (!container) return '# Aucun conteneur Docker trouvé sur ce serveur';

      const logsResult = await ssh.execCommand(
        `docker logs --tail=${tail} --timestamps "${container}" 2>&1`,
      );

      return logsResult.stdout || logsResult.stderr || '# Aucun log disponible';
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Erreur SSH: ${String(err)}`);
    } finally {
      ssh.dispose();
    }
  }

  emitGatewayLog(
    deploymentId: string,
    rawMessage: string,
    fallbackLevel: 'info' | 'error',
  ): void {
    const lines = rawMessage
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      this.gateway.emitLog({
        deploymentId,
        message: line,
        level: this.inferLogLevel(line, fallbackLevel),
        timestamp: new Date().toISOString(),
      });
    }
  }

  inferLogLevel(
    message: string,
    fallbackLevel: 'info' | 'error',
  ): DeploymentLogLevel {
    if (/error|fail|fatal|exception/i.test(message)) {
      return 'error';
    }

    if (/success|ok|done|completed|ready/i.test(message)) {
      return 'success';
    }

    return fallbackLevel;
  }

  slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }


  private resolveSshCommonArgs(): string {
    return this.serverHostKeyService.resolveSshCommonArgs();
  }

}
