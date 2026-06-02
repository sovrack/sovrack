import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type GitlabConfig } from '@prisma/client';
import {
  DEPLOYMENT_AUTO_DEPLOY_TRIGGER,
  type AutoDeployTriggerEvent,
} from '../../deployments/events/deployment.events';
import { PrismaService } from '../../../core/database/prisma.service';
import { GitlabApiService } from './gitlab-api.service';

/**
 * Fallback polling when no public WEBHOOK_URL is configured.
 * Polls GitLab every 60s for pipeline completions and fires auto-deploy.
 * Deactivated automatically when WEBHOOK_URL points to a non-localhost host.
 *
 * The last-seen pipeline cursor is persisted in GitlabConfig.lastPolledPipelineId
 * so it survives restarts and works correctly in multi-instance setups.
 */
@Injectable()
export class GitlabPollingService implements OnModuleInit {
  private readonly logger = new Logger(GitlabPollingService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiService: GitlabApiService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    this.enabled = this.shouldEnablePolling();
    if (this.enabled) {
      this.logger.log(
        'Polling GitLab activé (WEBHOOK_URL non configurée ou localhost). Intervalle: 60s',
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async pollPipelines(): Promise<void> {
    if (!this.enabled) return;

    const projects = await this.prisma.project.findMany({
      where: {
        gitlabConfig: { isNot: null },
        environments: { some: { autoDeploy: true } },
      },
      include: {
        gitlabConfig: true,
        environments: {
          where: { autoDeploy: true },
          select: { id: true, autoDeployBranch: true },
        },
      },
    });

    for (const project of projects) {
      if (!project.gitlabConfig || !project.gitlabId) continue;

      const repoId = Number(project.gitlabId);
      const branches = new Set<string>();

      for (const env of project.environments) {
        if (env.autoDeployBranch && env.autoDeployBranch !== '*') {
          branches.add(env.autoDeployBranch);
        } else {
          branches.add(project.gitlabConfig.defaultBranch ?? 'main');
        }
      }

      for (const branch of branches) {
        await this.pollBranch(project.id, project.gitlabConfig, repoId, branch);
      }
    }
  }

  private async pollBranch(
    projectId: string,
    gitlabConfig: GitlabConfig,
    repoId: number,
    branch: string,
  ): Promise<void> {
    try {
      const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, '');

      const pipelines = await this.apiService.getPipelines(
        gitlabConfig,
        repoId,
        normalizeUrl,
      );

      const successPipelines = pipelines.filter(
        (p) => p.status === 'success' && p.ref === branch,
      );

      if (successPipelines.length === 0) return;

      const latest = successPipelines[0];

      // Cursor persisted in DB — survives restarts and multi-instance deployments
      const lastSeen = gitlabConfig.lastPolledPipelineId ?? 0;

      if (latest.id <= lastSeen) return;

      // Persist new cursor immediately to prevent duplicate triggers
      await this.prisma.gitlabConfig.update({
        where: { id: gitlabConfig.id },
        data: { lastPolledPipelineId: latest.id },
      });

      if (lastSeen === 0) {
        // First poll after deploy/restart — seed cursor without triggering
        this.logger.debug(
          `Polling seed [${projectId}] branch=${branch} cursor=${String(latest.id)}`,
        );
        return;
      }

      this.logger.log(
        `Polling: nouveau pipeline ${String(latest.id)} sur ${projectId}/${branch} → auto-deploy`,
      );

      const event: AutoDeployTriggerEvent = {
        projectId,
        branch,
        pipelineId: latest.id,
      };

      await this.eventEmitter.emitAsync(DEPLOYMENT_AUTO_DEPLOY_TRIGGER, event);
    } catch (error) {
      this.logger.warn(
        `Polling échec [${projectId}/${branch}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private shouldEnablePolling(): boolean {
    const autoConfigureWebhook = !['0', 'false', 'no', 'off'].includes(
      this.configService.get<string>('GITLAB_WEBHOOK_AUTO_CONFIGURE', 'false').trim().toLowerCase(),
    );

    if (!autoConfigureWebhook) return true;

    const rawUrl = this.configService.get<string>('WEBHOOK_URL', '').trim();
    if (!rawUrl) return true;

    try {
      const parsed = new URL(rawUrl);
      const hostname = parsed.hostname;
      const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname.endsWith('.local');
      return isLocal;
    } catch {
      return true;
    }
  }
}
