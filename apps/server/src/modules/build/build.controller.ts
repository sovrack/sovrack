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
import { GetUser } from '../../core/decorators/get-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import type { JwtPayload } from '../../core/jwt/dto/jwt-payload.dto';
import { BuildDetectorService } from './build-detector.service';
import { BuildService } from './build.service';
import { BuildSetupService } from './services/build-setup.service';
import { CreateBuildConfigDto } from './dto/create-build-config.dto';

@Controller('projects/:id/build')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BuildController {
  constructor(
    private readonly buildService: BuildService,
    private readonly setupService: BuildSetupService,
    private readonly detector: BuildDetectorService,
  ) {}

  @Post('prepare')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async prepare(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
    @Query('serviceId') serviceId?: string,
    @Body() body?: CreateBuildConfigDto,
  ) {
    return await this.buildService.prepare(
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
  ) {
    await this.setupService.updateBuildConfig(id, dto, user.id, user.role);
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
  @Post('prepare-all')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async prepareAll(@Param('id') id: string, @GetUser() user: JwtPayload) {
    return await this.setupService.prepareAll(id, user.id, user.role);
  }

  /**
   * Reconfigure GitLab webhooks for all services (or single REPO source).
   */
  @Post('reconcile-webhooks')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  async reconcileWebhooks(
    @Param('id') id: string,
    @GetUser() user: JwtPayload,
  ) {
    return await this.setupService.reconcileWebhooks(id, user.id, user.role);
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
}
