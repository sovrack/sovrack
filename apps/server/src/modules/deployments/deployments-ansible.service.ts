import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { Deployment, DeploymentStatus } from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { NodeSSH } from 'node-ssh';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigsService } from '../configs/configs.service';
import { GitlabService } from '../gitlab/gitlab.service';
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

    if (!server.isVerified) {
      throw new BadRequestException('Serveur non vérifié');
    }

    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: server.host,
        port: server.port,
        username: server.username,
        privateKey: this.decryptSshKey(server.sshKey),
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
    await writeFile(privateKeyPath, this.decryptSshKey(server.sshKey), {
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

    try {
      const commandLogs = await this.runAnsible(
        playbookPath,
        inventoryPath,
        varsPath,
        privateKeyPath,
        deployment.id,
      );

      const finished = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.SUCCESS,
          dockerImage,
          finishedAt: new Date(),
          logs: `${currentLogs}\n${commandLogs}`.trim(),
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
          logs: `${currentLogs}\n${message}`.trim(),
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
    const secret = process.env.CONFIG_SECRET;
    if (!secret || secret.length < 32) {
      throw new InternalServerErrorException(
        'CONFIG_SECRET doit contenir au moins 32 caractères',
      );
    }
    const decrypted = CryptoJS.AES.decrypt(encryptedValue, secret).toString(
      CryptoJS.enc.Utf8,
    );
    return decrypted || encryptedValue;
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
}
