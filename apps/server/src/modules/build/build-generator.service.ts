import { Injectable } from '@nestjs/common';
import {
  DockerfileGenerator,
  type DockerfileGenerateOptions,
} from './generators/dockerfile/dockerfile.generator';
import {
  GitlabCiGenerator,
  type GitlabCiGenerateOptions,
} from './generators/gitlab-ci.generator';
import { DockerignoreGenerator } from './generators/dockerignore.generator';
import {
  GitlabFilePusherService,
  type BuildRepoPushResult,
} from './pusher/gitlab-file-pusher.service';
import { GitlabWebhookConfiguratorService } from './pusher/gitlab-webhook-configurator.service';

export type { BuildRepoPushResult };

type BuildConfig = DockerfileGenerateOptions &
  GitlabCiGenerateOptions & {
    type?: string;
    webhookUrl?: string;
  };

/**
 * Compatibility facade kept during migration.
 * New code should inject specialized generators/pusher directly.
 */
@Injectable()
export class BuildGeneratorService {
  constructor(
    private readonly dockerfileGenerator: DockerfileGenerator,
    private readonly gitlabCiGenerator: GitlabCiGenerator,
    private readonly dockerignoreGenerator: DockerignoreGenerator,
    private readonly gitlabFilePusher: GitlabFilePusherService,
    private readonly webhookConfigurator: GitlabWebhookConfiguratorService,
  ) {}

  generateDockerfile(type: string, config: BuildConfig): string {
    return this.dockerfileGenerator.generate(type, config);
  }

  generateGitlabCI(config: BuildConfig): string {
    return this.gitlabCiGenerator.generate(config);
  }

  generateDockerignore(): string {
    return this.dockerignoreGenerator.generate();
  }

  async pushFilesToRepo(
    projectId: string,
    files: Record<string, string>,
    serviceId?: string,
  ): Promise<BuildRepoPushResult> {
    return await this.gitlabFilePusher.pushFilesToRepo(projectId, files, serviceId);
  }

  async configureWebhook(projectId: string, serviceId?: string): Promise<void> {
    await this.webhookConfigurator.configureWebhook(projectId, serviceId);
  }
}
