import { BadRequestException, Injectable } from '@nestjs/common';
import { GitProviderType, ServiceType, SourceType, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { activeWhere } from '../../../../shared/database/prisma-active.helper';
import type { GitlabResolvedConfig } from './gitlab.types';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import { GitlabClient } from './gitlab.client';
import { CryptoService } from '../../../../shared/crypto/crypto.service';
import { PublicGitlabConfig } from './gitlab.types';
import { GitlabAuthorizationService } from './gitlab-authorization.service';
import { GitlabConnectionService } from './gitlab-connection.service';

/**
 * Onboarding/connexion d'un projet à GitLab (repo unique ou groupe entier),
 * extrait de GitlabAdapter — voir EXPLORATION_BACKEND_DEPENDANCES.md
 * section 4.
 */
@Injectable()
export class GitlabOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabClient,
    private readonly cryptoService: CryptoService,
    private readonly auth: GitlabAuthorizationService,
    private readonly connection: GitlabConnectionService,
  ) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    await this.auth.assertCanManageProject(projectId, userId, userRole);

    const connection = await this.connection.resolveGitlabConnectionInput(dto);
    const baseUrl = this.connection.normalizeUrl(connection.gitlabUrl);
    const defaultBranch = dto.defaultBranch ?? 'main';
    const webhookSecret = randomBytes(32).toString('hex');

    let repoPath: string | null = null;
    let groupPath: string | null = null;

    if (dto.repoPath) {
      const normalizedRepoPath = this.connection.normalizeRepositoryPath(
        dto.repoPath,
      );
      const repository = await this.apiService.getProjectByConnection(
        baseUrl,
        normalizedRepoPath,
        connection.gitlabToken,
      );
      repoPath = repository.path_with_namespace ?? normalizedRepoPath;
    } else if (dto.groupPath) {
      await this.apiService.getGroupByConnection(
        baseUrl,
        dto.groupPath,
        connection.gitlabToken,
      );
      groupPath = dto.groupPath;
    }

    // Find or create GitProviderConfig
    let gitProviderConfigId = connection.providerId;
    if (!gitProviderConfigId) {
      const newConfig = await this.prisma.gitProviderConfig.create({
        data: {
          name: `gitlab-${projectId.slice(0, 8)}`,
          type: GitProviderType.GITLAB,
          providerUrl: baseUrl,
          adminToken: this.cryptoService.encrypt(connection.gitlabToken),
          isDefault: false,
        },
      });
      gitProviderConfigId = newConfig.id;
    }

    // Find or create environment
    let env = await this.prisma.environment.findFirst({ where: { projectId } });
    if (!env) {
      env = await this.prisma.environment.create({
        data: { name: 'PRODUCTION', projectId },
      });
    }

    const config: GitlabResolvedConfig = {
      id: gitProviderConfigId,
      // Le consommateur (fetchGroupRepositories) lit providerUrl + providerToken
      // (chiffré, qu'il déchiffre) → on les fournit explicitement. gitlabUrl/
      // adminToken restent pour compat (tolérés par l'index signature).
      providerUrl: baseUrl,
      providerToken: this.cryptoService.encrypt(connection.gitlabToken),
      gitlabUrl: baseUrl,
      adminToken: connection.gitlabToken,
      repoPath,
      groupPath,
      defaultBranch,
      sourceType: SourceType.GIT,
      providerId: gitProviderConfigId,
      webhookSecret,
      createdAt: new Date(),
      updatedAt: new Date(),
      projectId,
    };

    // For single repo: update service metadata + register GitProviderRepo for webhooks
    if (repoPath) {
      // Find the service that was already created (by ServicesService.create) or find any
      // existing service for this provider in this project.
      const existingSvc = await this.prisma.service.findFirst({
        where: activeWhere({ projectId, providerId: gitProviderConfigId }),
      });

      let svcId: string;
      if (existingSvc) {
        // Update the existing service with resolved metadata
        await this.prisma.service.update({
          where: { id: existingSvc.id },
          data: { branch: defaultBranch, providerId: gitProviderConfigId },
        });
        svcId = existingSvc.id;
      } else {
        // Only create a service when there's no pre-existing one
        // (direct connectProject call, not via ServicesService.create)
        const created = await this.prisma.service.create({
          data: {
            projectId,
            name:
              repoPath.split('/').pop() ?? `project-${projectId.slice(0, 8)}`,
            type: ServiceType.APPLICATION,
            sourceType: SourceType.GIT,
            repoPath,
            branch: defaultBranch,
            providerId: gitProviderConfigId,
          },
        });
        svcId = created.id;
      }

      const existingLink = await this.prisma.serviceEnvironment.findFirst({
        where: { serviceId: svcId, environmentId: env.id },
      });
      if (!existingLink) {
        await this.prisma.serviceEnvironment.create({
          data: { serviceId: svcId, environmentId: env.id },
        });
      }

      if (connection.providerId) {
        await this.prisma.gitProviderRepo.upsert({
          where: {
            providerId_repoPath: {
              providerId: connection.providerId,
              repoPath,
            },
          },
          create: {
            providerId: connection.providerId,
            projectId,
            repoPath,
            defaultBranch,
            webhookSecret: this.cryptoService.encrypt(webhookSecret),
          },
          update: {
            projectId,
            defaultBranch,
            webhookSecret: this.cryptoService.encrypt(webhookSecret),
          },
        });
      }
    }

    // For group: auto-sync repos as GitProviderRepo entries
    if (groupPath) {
      try {
        const repos = await this.apiService.fetchGroupRepositories(
          config,
          (url) => this.connection.normalizeUrl(url),
        );
        for (const repo of repos) {
          if (!repo.path_with_namespace) continue;
          const repoBranch =
            repo.default_branch ?? repo.defaultBranch ?? 'main';
          await this.prisma.gitProviderRepo.upsert({
            where: {
              providerId_repoPath: {
                providerId: gitProviderConfigId,
                repoPath: repo.path_with_namespace,
              },
            },
            create: {
              providerId: gitProviderConfigId,
              repoPath: repo.path_with_namespace,
              defaultBranch: repoBranch,
            },
            update: {
              defaultBranch: repoBranch,
            },
          });
        }
      } catch {
        // Non-blocking
      }
    }

    return this.connection.toPublicConfig(config);
  }

  async verifyConnectionInput(dto: ConnectGitlabDto): Promise<void> {
    const connection = await this.connection.resolveGitlabConnectionInput(dto);
    const baseUrl = this.connection.normalizeUrl(connection.gitlabUrl);
    const defaultBranch = dto.defaultBranch?.trim() || 'main';

    if (dto.repoPath) {
      await this.apiService.getProjectByConnection(
        baseUrl,
        dto.repoPath,
        connection.gitlabToken,
      );

      const branches = await this.apiService.listProjectBranchesByConnection(
        baseUrl,
        dto.repoPath,
        connection.gitlabToken,
      );
      const branchExists = branches.some((branch) => {
        const name = branch.name;
        return typeof name === 'string' && name === defaultBranch;
      });

      if (!branchExists) {
        throw new BadRequestException(
          `Branche "${defaultBranch}" introuvable sur le repository GitLab.`,
        );
      }
      return;
    }

    if (dto.groupPath) {
      await this.apiService.getGroupByConnection(
        baseUrl,
        dto.groupPath,
        connection.gitlabToken,
      );

      const repositories =
        await this.apiService.listGroupRepositoriesByConnection(
          baseUrl,
          dto.groupPath,
          connection.gitlabToken,
        );

      if (repositories.length === 0) {
        throw new BadRequestException(
          'Aucun repository trouvé dans ce groupe GitLab.',
        );
      }
    }
  }
}
