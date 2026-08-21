import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { BuildDetectorService } from './detection/build-detector.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { BuildSetupService } from './lifecycle/build-setup.service';
import { BuildLifecycleService } from './lifecycle/build-lifecycle.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';
import { BuildStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkspaceAccessService } from '../iam/authorization/workspace-access.service';
import { ProjectActions } from '../iam/authorization/workspace-policy.types';
import { GetWorkspaceId } from '../../shared/decorators/get-workspace-id.decorator';
import { ProjectWorkspaceGuard } from '../iam/authorization/project-workspace.guard';

@ApiTags('Build')
@ApiBearerAuth()
@Controller([
  'workspaces/:workspaceId/projects/:id/build',
  'projects/:id/build',
])
@UseGuards(JwtAuthGuard, ProjectWorkspaceGuard)
export class BuildController {
  constructor(
    private readonly buildService: BuildOrchestratorService,
    private readonly setupService: BuildSetupService,
    private readonly detector: BuildDetectorService,
    private readonly buildsService: BuildLifecycleService,
    private readonly workspaceAccess: WorkspaceAccessService,
  ) {}

  @Post('generate')
  async generateBuildFiles(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @Body() body?: CreateBuildConfigDto,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.buildService.generateBuildFiles(
      id,
      user.id,
      user.role,
      serviceId,
      body?.overwriteDockerfile,
      body?.overwriteGitlabCi,
      workspaceId,
    );
  }

  @Get('detect')
  async detect(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.buildService.assertCanConfigureBuild(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.detector.detectProjectType(id, serviceId);
  }

  @Put('config')
  async updateConfig(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBuildConfigDto,
    @Query('serviceId') serviceId?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.setupService.updateBuildConfig(
      id,
      dto,
      user.id,
      user.role,
      serviceId,
      workspaceId,
    );
    return { message: 'Configuration mise à jour' };
  }

  @Get('templates')
  async getTemplates(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.setupService.getTemplates(
      id,
      user.id,
      user.role,
      workspaceId,
    );
  }

  @Post('push-files')
  async pushFiles(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.buildService.pushFiles(
      id,
      user.id,
      user.role,
      serviceId,
      workspaceId,
    );
    return { message: 'Fichiers poussés avec succès' };
  }

  /**
   * Prepare all services at once.
   * Returns per-service results so frontend can show progress.
   */
  @Post('generate-all')
  async generateAll(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    return await this.setupService.generateAll(
      id,
      user.id,
      user.role,
      workspaceId,
    );
  }

  /**
   * Get build readiness status per service.
   */
  @Get('status')
  async getBuildStatus(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.buildService.assertCanConfigureBuild(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.setupService.getBuildStatus(id);
  }

  /**
   * Extract docker-compose.yml from the linked GitLab repository.
   * Tries: docker-compose.yml, docker-compose.yaml, compose.yml, compose.yaml
   * (root first, then in subdirectories).
   *
   * Returns 200 with { content, filePath } on success, 404 if no compose file
   * is found in the repo.
   */
  @Get('extract-compose')
  async extractComposeFile(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.buildService.assertCanConfigureBuild(
      id,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.setupService.extractComposeFile(id, serviceId);
  }

  /**
   * Get information about the build engines available on the platform.
   * Used by the deployment dialog to show the strategy selector.
   */
  @Get('engines')
  async getAvailableEngines(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.READ,
      workspaceId,
    );
    return this.setupService.getAvailableEngines();
  }

  /**
   * P2-#1: list Build rows for a project (UI builds tab). Replaces the
   * pre-Build view that read buildStatus/buildLog/buildStrategy directly
   * from Deployment rows.
   */
  @Get('history')
  async listBuilds(
    @Param('id') projectId: string,
    @GetUser() user: JwtPayload,
    @Query('status') status?: BuildStatus,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    await this.workspaceAccess.assertProjectAction(
      projectId,
      user.id,
      ProjectActions.READ,
      workspaceId,
    );
    const parsedLimit = limit
      ? Math.min(200, Math.max(1, parseInt(limit, 10) || 50))
      : 50;
    return this.buildsService.listForProject(projectId, {
      ...(status ? { status } : {}),
      ...(branch ? { branch } : {}),
      limit: parsedLimit,
    });
  }

  @Get('history/:buildId')
  async getBuild(
    @Param('buildId') buildId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId?: string,
  ) {
    const build = await this.buildsService.findOne(buildId);
    await this.workspaceAccess.assertProjectAction(
      build.projectId,
      user.id,
      ProjectActions.READ,
      workspaceId,
    );
    return build;
  }
}
