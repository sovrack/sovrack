import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import axios from 'axios';
import { Deployment, DeploymentStatus } from '@prisma/client';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigsService } from '../configs/configs.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { ServersCryptoService } from '../servers/services';
import { DeploymentsDockerService } from './deployments-docker.service';
import { DeploymentsGateway } from './deployments.gateway';

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DeploymentsAnsibleService {
  private readonly logger = new Logger(DeploymentsAnsibleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configsService: ConfigsService,
    @Inject(forwardRef(() => GitlabService))
    private readonly gitlabService: GitlabService,
    private readonly serversCryptoService: ServersCryptoService,
    private readonly dockerService: DeploymentsDockerService,
    @Inject(forwardRef(() => DeploymentsGateway))
    private readonly gateway: DeploymentsGateway,
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
        environment: {
          include: {
            server: true,
          },
        },
        user: true,
      },
    });

    if (!deployment) {
      throw new BadRequestException('Déploiement non trouvé');
    }

    const server = deployment.environment.server;
    const decryptedSshKey = this.decryptSshKey(server.sshKey);

    if (!server.isVerified) {
      throw new BadRequestException('Serveur non vérifié');
    }

    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: decryptedSshKey,
        readyTimeout: 10_000,
      });
    } catch {
      throw new BadRequestException(
        'Connexion SSH échouée vers le serveur cible',
      );
    } finally {
      ssh.dispose();
    }

    const allConfigs = await this.configsService.getDecrypted(
      deployment.projectId,
      deployment.userId,
      deployment.user.role,
    );

    const tmpPath = await mkdtemp(join(tmpdir(), 'deploy-ansible-'));
    const inventoryPath = join(tmpPath, 'inventory.ini');
    const varsPath = join(tmpPath, 'vars.json');
    const privateKeyPath = `/tmp/deploy_key_${deployment.id}`;

    const playbookRoot = this.resolvePlaybookRoot();
    const playbookPath = join(playbookRoot, 'deploy.yml');

    const containerName = this.slugify(deployment.project.name);
    const dockerImage =
      overrideImage ??
      deployment.dockerImage ??
      (await this.dockerService.buildDockerImage({
        gitlabConfig: deployment.project.gitlabConfig,
        projectName: deployment.project.name,
        branch: deployment.branch,
      }));

    const registryAuth = deployment.project.gitlabConfig
      ? this.gitlabService.resolveRegistryCredentials(
          deployment.project.gitlabConfig,
        )
      : null;

    const inventoryContent =
      `[targets]\n` +
      `${server.host} ansible_user=${server.username} ansible_port=${String(server.port)}\n`;

    const varsContent = {
      app_name: deployment.project.name,
      app_port: deployment.project.port,
      container_name: containerName,
      docker_image: dockerImage,
      registry_url: registryAuth?.registryUrl ?? '',
      registry_username: registryAuth?.username ?? '',
      registry_password: registryAuth?.password ?? '',
      domain: deployment.environment.domain ?? '',
      env_vars: allConfigs,
    };

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

      const healthCheckLogs = await this.runPostDeployHealthChecks({
        deploymentId: deployment.id,
        environmentDomain: deployment.environment.domain,
        serverHost: server.host,
        appPort: deployment.project.port,
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
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      const ansiblePlaybookCommand = this.resolveAnsiblePlaybookCommand();
      const child = spawn(ansiblePlaybookCommand, [
        playbookPath,
        '-i',
        inventoryPath,
        '--private-key',
        privateKeyPath,
        '--extra-vars',
        `@${varsPath}`,
      ]);

      let output = '';

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
          resolvePromise(output);
          return;
        }
        rejectPromise(
          new Error(`ansible-playbook a échoué (code ${String(code)})`),
        );
      });

      child.on('error', (error) => {
        this.logger.error(error);
        rejectPromise(error);
      });
    });
  }

  resolveAnsiblePlaybookCommand(): string {
    const configuredVenvPath = process.env.ANSIBLE_VENV_PATH?.trim();
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
    const configuredPath = process.env.ANSIBLE_PLAYBOOKS_PATH?.trim();
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

  private async runPostDeployHealthChecks(params: {
    deploymentId: string;
    environmentDomain: string | null;
    serverHost: string;
    appPort: number;
  }): Promise<string> {
    if (!this.isPostDeployHealthCheckEnabled()) {
      return 'Health-check post-déploiement ignoré (DEPLOY_HEALTHCHECK_ENABLED=false).';
    }

    const timeoutMs = this.parsePositiveInt(
      process.env.DEPLOY_HEALTHCHECK_TIMEOUT_MS,
      5000,
    );
    const retries = this.parsePositiveInt(
      process.env.DEPLOY_HEALTHCHECK_RETRIES,
      6,
    );
    const retryDelayMs = this.parsePositiveInt(
      process.env.DEPLOY_HEALTHCHECK_RETRY_DELAY_MS,
      4000,
    );

    const targets = this.buildHealthCheckTargets({
      environmentDomain: params.environmentDomain,
      serverHost: params.serverHost,
      appPort: params.appPort,
    });

    if (targets.length === 0) {
      return 'Health-check post-déploiement ignoré (aucune cible disponible).';
    }

    let lastError = '';
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      for (const target of targets) {
        this.emitGatewayLog(
          params.deploymentId,
          `[HEALTHCHECK] Tentative ${String(attempt)}/${String(retries)}: ${target}`,
          'info',
        );

        try {
          const response = await axios.get(target, {
            timeout: timeoutMs,
            validateStatus: () => true,
            maxRedirects: 0,
          });

          if (
            response.status >= 200 &&
            response.status < 500 &&
            response.status !== 429
          ) {
            const successMessage = `[HEALTHCHECK] OK ${target} (status ${String(response.status)})`;
            this.emitGatewayLog(params.deploymentId, successMessage, 'info');
            return `Health-check post-déploiement OK sur ${target} (status ${String(response.status)}).`;
          }

          lastError = `${target} a répondu status ${String(response.status)}`;
        } catch (error) {
          lastError = `${
            error instanceof Error ? error.message : 'erreur inconnue'
          } (${target})`;
        }
      }

      if (attempt < retries) {
        await this.sleep(retryDelayMs);
      }
    }

    throw new BadRequestException(
      `Health-check post-déploiement échoué après ${String(retries)} tentative(s). Dernière erreur: ${lastError}`,
    );
  }

  private isPostDeployHealthCheckEnabled(): boolean {
    const raw = (process.env.DEPLOY_HEALTHCHECK_ENABLED ?? 'true').trim();
    return raw !== '0' && raw.toLowerCase() !== 'false';
  }

  private parsePositiveInt(
    rawValue: string | undefined,
    fallback: number,
  ): number {
    if (!rawValue?.trim()) {
      return fallback;
    }

    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  private buildHealthCheckTargets(params: {
    environmentDomain: string | null;
    serverHost: string;
    appPort: number;
  }): string[] {
    const targets = new Set<string>();

    if (params.environmentDomain?.trim()) {
      for (const baseUrl of this.toBaseUrls(params.environmentDomain.trim())) {
        targets.add(`${baseUrl}/health`);
        targets.add(`${baseUrl}/`);
      }
    }

    const hostBase = `http://${params.serverHost}:${String(params.appPort)}`;
    targets.add(`${hostBase}/health`);
    targets.add(`${hostBase}/`);

    return [...targets];
  }

  private toBaseUrls(hostOrUrl: string): string[] {
    const normalized = hostOrUrl.replace(/\/+$/g, '');
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return [normalized];
    }

    return [`https://${normalized}`, `http://${normalized}`];
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, ms);
    });
  }
}
