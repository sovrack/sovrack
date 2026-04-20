import { Injectable } from '@nestjs/common';
import { Role, type GitlabConfig } from '@prisma/client';
import { ConnectGitlabDto } from './dto/connect-gitlab.dto';
import {
  GitlabBranchItem,
  GitlabPipelineItem,
  GitlabRepoItem,
} from './gitlab-api.service';
import { PublicGitlabConfig } from './gitlab-crypto.service';
import { GitlabCoreService } from './gitlab-core.service';
import { GitlabWebhookPayload } from './gitlab-webhook.service';

@Injectable()
export class GitlabService {
  constructor(private readonly core: GitlabCoreService) {}

  async connectProject(
    projectId: string,
    dto: ConnectGitlabDto,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    return await this.core.connectProject(projectId, dto, userId, userRole);
  }

  async getBranches(
    projectId: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabBranchItem[]> {
    return await this.core.getBranches(
      projectId,
      userId,
      userRole,
      preferredRepoId,
    );
  }

  async getPipelines(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabPipelineItem[]> {
    return await this.core.getPipelines(projectId, userId, userRole);
  }

  async triggerPipeline(
    projectId: string,
    branch: string,
    userId: string,
    userRole: Role,
    preferredRepoId?: number,
  ): Promise<GitlabPipelineItem> {
    return await this.core.triggerPipeline(
      projectId,
      branch,
      userId,
      userRole,
      preferredRepoId,
    );
  }

  async getRepos(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<GitlabRepoItem[]> {
    return await this.core.getRepos(projectId, userId, userRole);
  }

  async handleWebhook(
    payload: GitlabWebhookPayload,
  ): Promise<{ status: 'ignored' | 'ok' }> {
    return await this.core.handleWebhook(payload);
  }

  async getGitlabConfig(
    projectId: string,
    userId: string,
    userRole: Role,
  ): Promise<PublicGitlabConfig> {
    return await this.core.getGitlabConfig(projectId, userId, userRole);
  }

  async verifyWebhookToken(
    token?: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    return await this.core.verifyWebhookToken(token, payload);
  }

  resolveRegistryCredentials(config: GitlabConfig) {
    return this.core.resolveRegistryCredentials(config);
  }

  async resolveRepositoryPath(
    config: GitlabConfig,
    fallbackProjectSlug: string,
    preferredRepoId?: number,
  ) {
    return await this.core.resolveRepositoryPath(
      config,
      fallbackProjectSlug,
      preferredRepoId,
    );
  }
}
