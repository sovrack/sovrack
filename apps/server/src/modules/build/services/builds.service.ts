import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Build, BuildPack, BuildStatus, BuildTrigger, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Service responsible for the lifecycle of `Build` rows — the central table
 * introduced by P2-#1 of the refactoring plan.
 *
 * A Build represents one attempt to produce a deployable artifact from a git
 * commit. It is decoupled from `Deployment`: one Build can be deployed
 * multiple times, and one Deployment always references exactly one Build.
 *
 * In phase 1 (non-breaking) the deployment create flow is updated to:
 *   1. Call {@link createForDeployment} → returns a Build row
 *   2. Set `deployment.buildId = build.id`
 *   3. The legacy `buildStrategy`/`buildMode`/etc. fields on Deployment are
 *      kept populated for backward compat — they are duplicated values of
 *      what the Build already holds.
 *
 * In phase 2 (breaking) those legacy fields on Deployment will be dropped
 * and Deployment will read them transitively from `build.*`.
 */
@Injectable()
export class BuildsService {
  private readonly logger = new Logger(BuildsService.name);

  constructor(private readonly prisma: PrismaService) {}



  /**
   * Create a new Build row.
   * Pass an active Prisma transaction (`tx`) to create the Build atomically
   * alongside other records (e.g. a Deployment referencing this Build).
   */
  async create(
    params: {
      projectId: string;
      serviceId?: string | null;
      userId: string;
      branch: string;
      buildPack: BuildPack;
      isLocalBuild?: boolean;
      nixpacksConfig?: Prisma.InputJsonValue | null;
      staticConfig?: Prisma.InputJsonValue | null;
      externalPipelineId?: bigint | null;
      triggeredBy?: BuildTrigger;
      initialStatus?: BuildStatus;
      commitSha?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Build> {
    const client = tx ?? this.prisma;
    return client.build.create({
      data: {
        projectId: params.projectId,
        serviceId: params.serviceId ?? null,
        userId: params.userId,
        branch: params.branch,
        buildPack: params.buildPack,
        isLocalBuild: params.isLocalBuild ?? false,
        status: params.initialStatus ?? BuildStatus.NOT_BUILT,
        triggeredBy: params.triggeredBy ?? BuildTrigger.MANUAL,
        nixpacksConfig: params.nixpacksConfig ?? Prisma.JsonNull,
        staticConfig: params.staticConfig ?? Prisma.JsonNull,
        externalPipelineId: params.externalPipelineId ?? null,
        commitSha: params.commitSha ?? null,
      },
    });
  }

  /**
   * Mark a build as started (used by the GitLab pipeline path).
   */
  async markStarted(buildId: string, externalPipelineId?: bigint): Promise<Build> {
    return this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: BuildStatus.BUILDING,
        startedAt: new Date(),
        ...(externalPipelineId ? { externalPipelineId } : {}),
      },
    });
  }

  /**
   * Mark a build as succeeded, optionally with the immutable image digest
   * for rollback pinning.
   */
  async markSucceeded(buildId: string, imageSha?: string | null): Promise<Build> {
    return this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: BuildStatus.SUCCESS,
        finishedAt: new Date(),
        ...(imageSha ? { imageSha } : {}),
      },
    });
  }

  /**
   * Mark a build as failed with an error message.
   */
  async markFailed(buildId: string, errorMessage: string): Promise<Build> {
    return this.prisma.build.update({
      where: { id: buildId },
      data: {
        status: BuildStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: errorMessage.slice(0, 50_000),
      },
    });
  }

  /**
   * List builds for a project (newest first). Used by the UI "builds" tab.
   */
  async listForProject(
    projectId: string,
    options: { status?: BuildStatus; branch?: string; limit?: number } = {},
  ): Promise<Build[]> {
    return this.prisma.build.findMany({
      where: {
        projectId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.branch ? { branch: options.branch } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
    });
  }

  async findOne(id: string): Promise<Build> {
    const build = await this.prisma.build.findUnique({ where: { id } });
    if (!build) {
      throw new NotFoundException(`Build ${id} introuvable`);
    }
    return build;
  }
}
