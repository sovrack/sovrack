import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';
import { MonitoringService } from '../services/monitoring.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

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
}
