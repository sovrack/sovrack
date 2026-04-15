import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  Deployment,
  DeploymentStatus,
  GitlabConfig,
  GitlabSourceType,
  Prisma,
  ProjectMemberRole,
  Role,
  type User,
} from '@prisma/client';
import * as CryptoJS from 'crypto-js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { chmod, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { NodeSSH } from 'node-ssh';
import { ConfigsService } from '../configs/configs.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeploymentDto } from './dto/create-deployment.dto';
import { DeploymentsGateway } from './deployments.gateway';

const deploymentRelationsInclude = {
  project: {
    select: {
      id: true,
      name: true,
      gitlabUrl: true,
    },
  },
  environment: {
    select: {
      id: true,
      name: true,
      server: {
        select: {
          id: true,
          name: true,
          host: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
    },
  },
} satisfies Prisma.DeploymentInclude;

type DeploymentWithRelations = Prisma.DeploymentGetPayload<{
  include: typeof deploymentRelationsInclude;
}>;

type DeploymentLogLevel = 'info' | 'error' | 'success';

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => GitlabService))
    private readonly gitlabService: GitlabService,
    private readonly configsService: ConfigsService,
    private readonly gateway: DeploymentsGateway,
  ) {}

  async create(dto: CreateDeploymentDto, userId: string): Promise<Deployment> {
    const actor = await this.getActor(userId);
    await this.assertCanAccessProject(dto.projectId, actor.id, actor.role);

    const environment = await this.prisma.environment.findFirst({
      where: {
        id: dto.environmentId,
        projectId: dto.projectId,
      },
      include: {
        server: true,
      },
    });

    if (!environment) {
      throw new NotFoundException('Environnement non trouvé pour ce projet');
    }

    if (!environment.server.isVerified) {
      throw new BadRequestException('Le serveur cible doit être vérifié');
    }

    if (!environment.server.hasDocker) {
      throw new BadRequestException(
        'Le serveur cible doit avoir Docker installé',
      );
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      include: { gitlabConfig: true },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (!project.gitlabConfig) {
      throw new BadRequestException(
        'Configuration GitLab manquante sur ce projet',
      );
    }

    await this.configsService.getDecrypted(dto.projectId, actor.id, actor.role);

    const branch = dto.branch ?? project.branch;
    const dockerImage = await this.buildDockerImage({
      gitlabConfig: project.gitlabConfig,
      projectName: project.name,
      projectGitlabUrl: project.gitlabUrl,
      branch,
      repositoryId: dto.repoId,
    });

    let deployment = await this.prisma.deployment.create({
      data: {
        projectId: dto.projectId,
        environmentId: dto.environmentId,
        userId: actor.id,
        branch,
        status: DeploymentStatus.PENDING,
        startedAt: new Date(),
      },
    });

    this.gateway.emitStarted({
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      environmentId: deployment.environmentId,
      status: deployment.status,
      startedAt: deployment.startedAt,
    });

    let pipeline: { id: number };
    try {
      pipeline = await this.gitlabService.triggerPipeline(
        dto.projectId,
        branch,
        actor.id,
        actor.role,
        dto.repoId,
      );
    } catch (error: unknown) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Échec du déclenchement du pipeline GitLab';

      const failed = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: DeploymentStatus.FAILED,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\n${reason}`.trim(),
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

      throw error;
    }

    deployment = await this.prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: DeploymentStatus.RUNNING,
        logs: `Déploiement lancé. [PIPELINE_ID:${String(pipeline.id)}]`,
        dockerImage,
      },
    });

    this.gateway.emitStatus({
      deploymentId: deployment.id,
      status: deployment.status,
    });

    return deployment;
  }

  async handleWebhookUpdate(
    pipelineId: number,
    status: string,
    image?: string,
  ): Promise<{ status: 'ok' | 'ignored' }> {
    const marker = `[PIPELINE_ID:${String(pipelineId)}]`;

    const deployment = await this.prisma.deployment.findFirst({
      where: {
        logs: {
          contains: marker,
        },
        status: {
          in: [DeploymentStatus.PENDING, DeploymentStatus.RUNNING],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!deployment) {
      return { status: 'ignored' };
    }

    const mappedStatus = this.mapDeploymentStatus(status);

    if (mappedStatus === DeploymentStatus.SUCCESS) {
      await this.deployWithAnsible(deployment.id, image);
      return { status: 'ok' };
    }

    if (
      mappedStatus === DeploymentStatus.FAILED ||
      mappedStatus === DeploymentStatus.CANCELED
    ) {
      const updated = await this.prisma.deployment.update({
        where: { id: deployment.id },
        data: {
          status: mappedStatus,
          finishedAt: new Date(),
          logs: `${deployment.logs ?? ''}\nPipeline GitLab: ${status}`.trim(),
        },
      });

      this.gateway.emitStatus({
        deploymentId: updated.id,
        status: updated.status,
      });

      this.gateway.emitFinished({
        deploymentId: updated.id,
        status: updated.status,
        finishedAt: updated.finishedAt,
      });
    }

    return { status: 'ok' };
  }

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
      throw new NotFoundException('Déploiement non trouvé');
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
        // Déchiffrement de la clé SSH chiffrée en AES en base avant connexion.
        privateKey: this.decryptSshKey(server.sshKey),
        readyTimeout: 10000,
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
      (await this.buildDockerImage({
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
    // Clé privée déchiffrée et écrite en temporaire pour ansible-playbook (--private-key).
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
    } catch (error: unknown) {
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

  async findAll(
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations[]> {
    const where: Prisma.DeploymentWhereInput | undefined =
      userRole === Role.ADMIN
        ? undefined
        : {
            project: {
              members: {
                some: {
                  userId,
                },
              },
            },
          };

    return await this.prisma.deployment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: deploymentRelationsInclude,
    });
  }

  async findByProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations[]> {
    await this.assertCanAccessProject(projectId, userId, userRole);

    return await this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: deploymentRelationsInclude,
    });
  }

  async findOne(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<DeploymentWithRelations> {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id },
      include: deploymentRelationsInclude,
    });

    if (!deployment) {
      throw new NotFoundException('Déploiement non trouvé');
    }

    await this.assertCanAccessProject(deployment.projectId, userId, userRole);

    return deployment;
  }

  async cancel(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<Deployment> {
    const deployment = await this.findOne(id, userId, userRole);

    if (
      deployment.status !== DeploymentStatus.PENDING &&
      deployment.status !== DeploymentStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Annulation possible uniquement pour un déploiement PENDING ou RUNNING',
      );
    }

    const canceled = await this.prisma.deployment.update({
      where: { id },
      data: {
        status: DeploymentStatus.CANCELED,
        finishedAt: new Date(),
        logs: `${deployment.logs ?? ''}\nDéploiement annulé par l'utilisateur`.trim(),
      },
    });

    this.gateway.emitStatus({
      deploymentId: canceled.id,
      status: canceled.status,
    });

    return canceled;
  }

  async rollback(
    id: string,
    userId: string,
    userRole: Role,
  ): Promise<Deployment> {
    const deployment = await this.findOne(id, userId, userRole);

    const previousSuccess = await this.prisma.deployment.findFirst({
      where: {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        status: DeploymentStatus.SUCCESS,
        id: {
          not: deployment.id,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!previousSuccess) {
      throw new BadRequestException(
        'Aucun déploiement SUCCESS précédent trouvé',
      );
    }

    if (!previousSuccess.dockerImage) {
      throw new BadRequestException('Image de rollback introuvable');
    }

    const actor = await this.getActor(userId);

    const rollbackDeployment = await this.prisma.deployment.create({
      data: {
        projectId: deployment.projectId,
        environmentId: deployment.environmentId,
        userId,
        branch: previousSuccess.branch,
        status: DeploymentStatus.RUNNING,
        dockerImage: previousSuccess.dockerImage,
        startedAt: new Date(),
        logs: `Rollback depuis ${previousSuccess.id}`,
      },
    });

    this.gateway.emitStarted({
      deploymentId: rollbackDeployment.id,
      projectId: rollbackDeployment.projectId,
      environmentId: rollbackDeployment.environmentId,
      status: rollbackDeployment.status,
      startedAt: rollbackDeployment.startedAt,
      initiatorRole: actor.role,
    });

    return await this.deployWithAnsible(
      rollbackDeployment.id,
      previousSuccess.dockerImage,
    );
  }

  private async runAnsible(
    playbookPath: string,
    inventoryPath: string,
    varsPath: string,
    privateKeyPath: string,
    deploymentId: string,
  ): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
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
          resolve(output);
          return;
        }
        reject(new Error(`ansible-playbook a échoué (code ${String(code)})`));
      });

      child.on('error', (error) => {
        this.logger.error(error);
        reject(error);
      });
    });
  }

  private resolveAnsiblePlaybookCommand(): string {
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

  private resolvePlaybookRoot(): string {
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

  private emitGatewayLog(
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

  private inferLogLevel(
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

  private async getActor(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return user;
  }

  private async assertCanAccessProject(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Projet non trouvé');
    }

    if (userRole === Role.ADMIN) {
      return;
    }

    const member = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Accès non autorisé à ce projet');
    }

    if (
      member.role !== ProjectMemberRole.OWNER &&
      member.role !== ProjectMemberRole.MEMBER
    ) {
      throw new ForbiddenException('Rôle non autorisé');
    }
  }

  private mapDeploymentStatus(status: string): DeploymentStatus {
    const normalized = status.toLowerCase();
    if (normalized === 'success') {
      return DeploymentStatus.SUCCESS;
    }
    if (normalized === 'failed') {
      return DeploymentStatus.FAILED;
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return DeploymentStatus.CANCELED;
    }
    if (normalized === 'running') {
      return DeploymentStatus.RUNNING;
    }
    return DeploymentStatus.PENDING;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  // Compose une image Docker valide (registry/path:tag) pour REPO et GROUP.
  private async buildDockerImage({
    gitlabConfig,
    projectName,
    projectGitlabUrl,
    branch,
    repositoryId,
  }: {
    gitlabConfig?: GitlabConfig | null;
    projectName: string;
    projectGitlabUrl?: string | null;
    branch: string;
    repositoryId?: number;
  }): Promise<string> {
    if (!gitlabConfig) {
      return `${this.slugify(projectName)}:${this.sanitizeDockerTag(branch)}`;
    }

    const registryHost = this.resolveRegistryHost(
      gitlabConfig.registryUrl,
      gitlabConfig.gitlabUrl,
    );
    const resolvedPath = await this.gitlabService.resolveRepositoryPath(
      gitlabConfig,
      this.slugify(projectName),
      repositoryId,
    );
    const fallbackPathFromUrl =
      this.extractRepositoryPathFromProjectUrl(projectGitlabUrl);
    const repositoryPath =
      fallbackPathFromUrl &&
      this.isPlaceholderRepositoryPath(gitlabConfig, resolvedPath)
        ? fallbackPathFromUrl
        : resolvedPath;
    const tag = this.sanitizeDockerTag(branch);

    return `${registryHost}/${repositoryPath}:${tag}`;
  }

  private sanitizeDockerTag(value: string): string {
    const sanitized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return sanitized || 'latest';
  }

  private resolveRegistryHost(
    registryUrl: string | null | undefined,
    gitlabUrl: string,
  ): string {
    if (registryUrl && registryUrl.trim()) {
      return this.cleanRegistryHost(registryUrl);
    }

    try {
      const parsed = new URL(gitlabUrl);
      if (parsed.hostname.toLowerCase() === 'gitlab.com') {
        return 'registry.gitlab.com';
      }
      if (parsed.port) {
        return parsed.host;
      }
      return `${parsed.hostname}:5050`;
    } catch {
      const fallback = this.cleanRegistryHost(gitlabUrl);
      return fallback.includes(':') ? fallback : `${fallback}:5050`;
    }
  }

  private cleanRegistryHost(value: string): string {
    return value
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
  }

  private extractRepositoryPathFromProjectUrl(
    projectGitlabUrl?: string | null,
  ): string | null {
    if (!projectGitlabUrl?.trim()) {
      return null;
    }

    try {
      const parsed = new URL(projectGitlabUrl);
      const path = parsed.pathname
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');

      return path || null;
    } catch {
      const cleaned = projectGitlabUrl
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^[^/]+\/?/, '')
        .replace(/\/+$/, '')
        .replace(/\.git$/i, '');

      return cleaned || null;
    }
  }

  private isPlaceholderRepositoryPath(
    config: GitlabConfig,
    repositoryPath: string,
  ): boolean {
    if (
      config.sourceType === GitlabSourceType.REPO &&
      config.gitlabId &&
      repositoryPath.startsWith(`project-${String(config.gitlabId)}/`)
    ) {
      return true;
    }

    return Boolean(
      config.sourceType === GitlabSourceType.GROUP &&
      config.gitlabGroupId &&
      repositoryPath.startsWith(`group-${String(config.gitlabGroupId)}/`),
    );
  }

  // Déchiffre la clé SSH AES-256 stockée en base.
  // Compatibilité ascendante : si le déchiffrement échoue, retourne la valeur brute.
  private decryptSshKey(encryptedValue: string): string {
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
}
