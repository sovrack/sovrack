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
import { Role } from '@prisma/client';
import { GetUser } from '../../shared/decorators/get-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { BuildDetectorService } from './detection/build-detector.service';
import { BuildOrchestratorService } from './build-orchestrator.service';
import { BuildSetupService } from './lifecycle/build-setup.service';
import { BuildLifecycleService } from './lifecycle/build-lifecycle.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';
import { BuildStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WebhookManagementService } from '../webhooks/webhook-management.service';

@ApiTags('Build')
@ApiBearerAuth()
@Controller('projects/:id/build')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BuildController {
  constructor(
    private readonly buildService: BuildOrchestratorService,
    private readonly setupService: BuildSetupService,
    private readonly detector: BuildDetectorService,
    private readonly buildsService: BuildLifecycleService,
    private readonly webhookManagement: WebhookManagementService,
  ) {}

  @Post('generate')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async generateBuildFiles(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @Body() body?: CreateBuildConfigDto,
  ) {
    return await this.buildService.generateBuildFiles(
      id,
      user.id,
      user.role,
      serviceId,
      body?.overwriteDockerfile,
      body?.overwriteGitlabCi,
    );
  }

  @Get('detect')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async detect(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.buildService.assertCanConfigureBuild(id, user.id, user.role);
    return await this.detector.detectProjectType(id, serviceId);
  }

  @Put('config')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async updateConfig(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Body() dto: CreateBuildConfigDto,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.setupService.updateBuildConfig(
      id,
      dto,
      user.id,
      user.role,
      serviceId,
    );
    return { message: 'Configuration mise à jour' };
  }

  @Get('templates')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getTemplates(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.setupService.getTemplates(id, user.id, user.role);
  }

  @Post('push-files')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async pushFiles(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.buildService.pushFiles(id, user.id, user.role, serviceId);
    return { message: 'Fichiers poussés avec succès' };
  }

  /**
   * Prepare all services at once.
   * Returns per-service results so frontend can show progress.
   */
  @Post('generate-all')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async generateAll(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.setupService.generateAll(id, user.id, user.role);
  }

  /**
   * Legacy endpoint kept for frontend compatibility: webhook configuration
   * for a project's services is now owned by webhooks/ (see
   * POST /projects/:projectId/webhook/configure) — this only returns a
   * per-service redirect notice.
   */
  @Post('reconcile-webhooks')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async reconcileWebhooks(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.buildService.assertCanConfigureBuild(id, user.id, user.role);
    return await this.webhookManagement.reconcileWebhooksNotice(id);
  }

  /**
   * Get build readiness status per service.
   */
  @Get('status')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getBuildStatus(@Param('id') id: string, @GetUser() user: JwtPayload) {
    await this.buildService.assertCanConfigureBuild(id, user.id, user.role);
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
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async extractComposeFile(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
  ) {
    await this.buildService.assertCanConfigureBuild(id, user.id, user.role);
    return await this.setupService.extractComposeFile(id, serviceId);
  }

  /**
   * Get information about the build engines available on the platform.
   * Used by the deployment dialog to show the strategy selector.
   */
  @Get('engines')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getAvailableEngines() {
    return await this.setupService.getAvailableEngines();
  }

  /**
   * P2-#1: list Build rows for a project (UI builds tab). Replaces the
   * pre-Build view that read buildStatus/buildLog/buildStrategy directly
   * from Deployment rows.
   */
  @Get('history')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async listBuilds(
    @Param('id') projectId: string,
    @Query('status') status?: BuildStatus,
    @Query('branch') branch?: string,
    @Query('limit') limit?: string,
  ) {
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
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async getBuild(@Param('buildId') buildId: string) {
    return this.buildsService.findOne(buildId);
  }
}
