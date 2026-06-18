import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BuildPack, DeploymentStrategy, Role } from '@prisma/client';
import { existsSync } from 'fs';
import { chmod, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { EnvConfigsService } from '../../configs/env-configs.service';
import { GitProvidersService } from '../../git-providers/git-providers.service';
import { BuildStrategyResolver } from '../../build/strategies/build-strategy.resolver';
import type { BuildSource } from '../../build/strategies/build-strategy.interface';

export type DeploymentAnsibleFiles = {
  tmpPath: string;
  inventoryPath: string;
  varsPath: string;
  privateKeyPath: string;
  playbookPath: string;
  playbookFileName: string;
  route: { playbook: string; reason: string };
};

export type ResolvedDeploymentEnv = {
  allConfigs: Record<string, unknown>;
  dockerImage: string;
  containerName: string;
  isComposeDeployment: boolean;
};

/**
 * Resolves all environment variables, Ansible vars, and SSH key material
 * for a deployment. Writes temporary files needed by ansible-playbook.
 */
@Injectable()
export class DeploymentEnvResolverService {
  constructor(
    private readonly configService: ConfigService,
    private readonly envConfigsService: EnvConfigsService,
    private readonly gitProvidersService: GitProvidersService,
    private readonly buildStrategyResolver: BuildStrategyResolver,
  ) {}

  resolvePlaybookRoot(): string {
    const configuredPath = this.configService
      .get<string>('ANSIBLE_PLAYBOOKS_PATH')
      ?.trim();
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

  resolveDeploymentTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('DEPLOYMENT_ANSIBLE_TIMEOUT_MS'),
    );
    if (Number.isFinite(raw) && raw >= 60_000) {
      return Math.floor(raw);
    }
    return 900_000;
  }

  resolveRoute(deployment: {
    strategy: DeploymentStrategy;
    dockerImage: string | null;
    build?: { buildPack?: BuildPack | null; isLocalBuild?: boolean | null } | null;
  }) {
    const buildSource = this.inferBuildSource(
      deployment.build?.buildPack ?? BuildPack.DOCKERFILE,
      deployment.build?.isLocalBuild ?? false,
    );
    const isLocalBuild = deployment.build?.isLocalBuild ?? false;
    return {
      route: this.buildStrategyResolver.resolve({
        buildSource,
        strategy: deployment.strategy,
        dockerImage: deployment.dockerImage,
      }),
      isLocalBuild,
    };
  }

  private inferBuildSource(buildPack: BuildPack, isLocalBuild: boolean): BuildSource {
    if (buildPack === BuildPack.DOCKER_COMPOSE) return 'DOCKER_COMPOSE';
    if (buildPack === BuildPack.STATIC) return 'STATIC';
    if (buildPack === BuildPack.NIXPACKS) return isLocalBuild ? 'NIXPACKS_LOCAL' : 'NIXPACKS_REGISTRY';
    if (buildPack === BuildPack.NONE) return 'EXTERNAL_IMAGE';
    return isLocalBuild ? 'DOCKERFILE_LOCAL' : 'DOCKERFILE_REGISTRY';
  }

  async resolveEnvConfigs(
    deployment: {
      projectId: string;
      environmentId: string;
      userId: string | null;
      user: { role: Role } | null;
    },
  ): Promise<Record<string, unknown>> {
    return this.envConfigsService.getMergedDecrypted(
      deployment.projectId,
      deployment.environmentId,
      deployment.userId ?? 'SYSTEM',
      deployment.user?.role ?? Role.DEVELOPER,
    );
  }

  async writeTmpFiles(
    deployment: {
      id: string;
      branch: string;
      serviceId: string | null;
      project: { id: string; name: string; port: number; dockerComposeContent?: string | null };
      service?: { name?: string; externalRepoId?: bigint | null } | null;
    },
    server: { host: string; port: number; username: string },
    decryptedSshKey: string,
    dockerImage: string,
    allConfigs: Record<string, unknown>,
    playbookRoot: string,
    isComposeDeployment: boolean,
    isLocalBuild: boolean,
    playbookFileName: string,
    serviceTargetPort?: number | null,
    serviceTargetDomain?: string | null,
    registryAuth?: { registryUrl: string; username: string; password: string } | null,
    imageSha?: string | null,
  ): Promise<{ tmpPath: string; inventoryPath: string; varsPath: string; privateKeyPath: string; playbookPath: string }> {
    const tmpPath = await mkdtemp(join(tmpdir(), 'deploy-ansible-'));
    const inventoryPath = join(tmpPath, 'inventory.ini');
    const varsPath = join(tmpPath, 'vars.json');
    const privateKeyPath = `/tmp/deploy_key_${deployment.id}`;
    const playbookPath = join(playbookRoot, playbookFileName);

    const serviceName = deployment.service?.name;
    const containerName = this.slugify(
      serviceName
        ? `${deployment.project.name}-${serviceName}`
        : deployment.project.name,
    );

    const inventoryContent =
      `[targets]\n` +
      `${server.host} ansible_user=${server.username} ansible_port=${String(server.port)}\n`;

    const varsContent: Record<string, unknown> = {
      app_name: serviceName
        ? `${deployment.project.name}-${serviceName}`
        : deployment.project.name,
      app_port: serviceTargetPort ?? deployment.project.port,
      container_name: containerName,
      docker_image: dockerImage,
      ...((imageSha) && { docker_image_sha: imageSha }),
      registry_url: registryAuth?.registryUrl ?? '',
      registry_username: registryAuth?.username ?? '',
      registry_password: registryAuth?.password ?? '',
      domain: serviceTargetDomain ?? '',
      env_vars: allConfigs,
    };

    if (isComposeDeployment) {
      const composeContent = deployment.project.dockerComposeContent ?? '';
      if (!composeContent.trim()) {
        throw new BadRequestException(
          'Contenu docker-compose.yml manquant pour ce projet. ' +
            'Renseignez-le dans les paramètres du projet (Build → Docker Compose).',
        );
      }
      const envContent = Object.entries(allConfigs)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('\n');
      varsContent.compose_content = composeContent;
      varsContent.env_content = envContent;
    }

    if (isLocalBuild) {
      const gitCredentials = await this.gitProvidersService
        .forProject(deployment.project.id)
        .then((p) =>
          p.resolveGitCredentials(
            deployment.project.id,
            deployment.serviceId ?? undefined,
          ),
        );
      varsContent.git_token = gitCredentials.token;
      varsContent.repo_url = gitCredentials.repoUrl;
      varsContent.repo_branch = deployment.branch;
    }

    await writeFile(inventoryPath, inventoryContent, 'utf-8');
    await writeFile(varsPath, JSON.stringify(varsContent, null, 2), 'utf-8');
    await writeFile(privateKeyPath, decryptedSshKey, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    await chmod(privateKeyPath, 0o600);

    return { tmpPath, inventoryPath, varsPath, privateKeyPath, playbookPath };
  }

  async resolveRegistryAuth(
    projectId: string,
  ): Promise<{ registryUrl: string; username: string; password: string } | null> {
    try {
      const creds = await this.gitProvidersService
        .forProject(projectId)
        .then((p) => p.resolveRegistryCredentials(projectId));
      if (!creds?.registryUrl || !creds.username || !creds.password) return null;
      return { registryUrl: creds.registryUrl, username: creds.username, password: creds.password };
    } catch {
      return null;
    }
  }

  slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }
}
