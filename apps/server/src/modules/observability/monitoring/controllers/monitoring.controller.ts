import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetUser } from '../../../../core/decorators/get-user.decorator';
import { Roles } from '../../../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../core/guards/roles.guard';
import type { JwtPayload } from '../../../../core/jwt/dto/jwt-payload.dto';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';
import { MonitoringService } from '../services/monitoring.service';
import { ContainerStatsService } from '../../../containers/services/container-stats.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly containerMonitoring: ContainerStatsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Monitoring overview for platform operations' })
  async overview() {
    return await this.monitoringService.getOverview();
  }

  @Get('servers')
  @ApiOperation({ summary: 'Server monitoring status and metric snapshots' })
  async servers() {
    return await this.monitoringService.getServerMonitoring();
  }

  @Get('projects')
  @ApiOperation({
    summary: 'Project monitoring linked to deployments/pipelines',
  })
  async projects() {
    return await this.monitoringService.getProjectMonitoring();
  }

  @Get('deployments')
  @ApiOperation({ summary: 'Deployment health and history monitoring' })
  async deployments() {
    return await this.monitoringService.getDeploymentMonitoring();
  }

  @Get('prometheus/status')
  @ApiOperation({ summary: 'Prometheus connectivity and target status' })
  async prometheusStatus() {
    return await this.monitoringService.getPrometheusStatus();
  }

  @Get('grafana/status')
  @ApiOperation({ summary: 'Grafana connectivity and access status' })
  async grafanaStatus() {
    return await this.monitoringService.getGrafanaStatus();
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Monitoring alerts (Alertmanager or derived alerts)',
  })
  async alerts() {
    return await this.monitoringService.getAlerts();
  }

  @Get('install/options')
  @ApiOperation({
    summary: 'Monitoring installation actions and eligible servers',
  })
  async installOptions() {
    return await this.monitoringService.getInstallOptions();
  }

  @Post('install')
  @ApiOperation({
    summary:
      'Install monitoring components through allowlisted automation actions',
  })
  async install(
    @Body() dto: InstallMonitoringDto,
    @GetUser() user: JwtPayload,
  ) {
    return await this.monitoringService.installMonitoring(dto, user.id);
  }

  /* ── Container monitoring ────────────────────────────────────────────── */

  @Get('containers/deployment/:deploymentId')
  @ApiOperation({ summary: 'Get container stats and logs for a deployment' })
  async containerInfo(
    @Param('deploymentId') deploymentId: string,
    @Query('tail', new DefaultValuePipe(200), ParseIntPipe) tail: number,
  ) {
    return await this.containerMonitoring.getContainerInfo(deploymentId, tail);
  }

  @Get('containers/project/:projectId')
  @ApiOperation({ summary: 'List running containers for a project on a server' })
  async projectContainers(
    @Param('projectId') projectId: string,
    @Query('serverId') serverId: string,
  ) {
    return await this.containerMonitoring.listProjectContainers(projectId, serverId);
  }
}
