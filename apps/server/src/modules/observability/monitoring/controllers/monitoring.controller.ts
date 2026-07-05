import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { Roles } from '../../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../shared/guards/roles.guard';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { InstallMonitoringDto } from '../dto/install-monitoring.dto';
import { MonitoringService } from '../services/monitoring.service';
import { MonitoringAccessService } from '../services/monitoring-access.service';
import { ContainerStatsService } from '../../../infrastructure/containers/services/container-stats.service';

// LOT1a : le contrôleur reste ADMIN par défaut (vues d'infra globales), mais
// les routes scopées à UN projet (onglet Monitoring d'un service : stats
// conteneur, historique, liens Grafana) sont ouvertes aux DEVELOPER — avec
// vérification d'appartenance au projet (MonitoringAccessService), comme
// l'onglet Logs. Avant : @Roles(ADMIN) niveau classe → 403 sur tout l'onglet
// Monitoring pour un développeur.
@ApiTags('Monitoring')
@ApiBearerAuth()
@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly access: MonitoringAccessService,
    private readonly containerMonitoring: ContainerStatsService,
  ) {}

  @Get('overview')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Monitoring overview for platform operations' })
  async overview() {
    return await this.monitoringService.getOverview();
  }

  @Get('servers')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Server monitoring status and metric snapshots' })
  async servers() {
    return await this.monitoringService.getServerMonitoring();
  }

  @Get('projects')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary: 'Project monitoring linked to deployments/pipelines',
  })
  async projects() {
    return await this.monitoringService.getProjectMonitoring();
  }

  @Get('deployments')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Deployment health and history monitoring' })
  async deployments() {
    return await this.monitoringService.getDeploymentMonitoring();
  }

  @Get('prometheus/status')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Prometheus connectivity and target status' })
  async prometheusStatus() {
    return await this.monitoringService.getPrometheusStatus();
  }

  @Get('servers/:host/metrics/range')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary:
      'Historical CPU/mem/disk time-series for a host (Prometheus range)',
  })
  async serverMetricRange(
    @Param('host') host: string,
    @Query('minutes', new DefaultValuePipe(60), ParseIntPipe) minutes: number,
    @Query('step', new DefaultValuePipe(60), ParseIntPipe) step: number,
  ) {
    return await this.monitoringService.getServerMetricRange(
      host,
      minutes,
      step,
    );
  }

  @Get('services/:serviceEnvId/metrics/range')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary:
      'Historical CPU/memory time-series for a service-environment (Prometheus range)',
  })
  async serviceMetricRange(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
    @Query('minutes', new DefaultValuePipe(60), ParseIntPipe) minutes: number,
    @Query('step', new DefaultValuePipe(60), ParseIntPipe) step: number,
  ) {
    await this.access.assertServiceEnv(serviceEnvId, user.id, user.role);
    return await this.monitoringService.getServiceMetricRange(
      serviceEnvId,
      minutes,
      step,
    );
  }

  @Get('grafana/status')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Grafana connectivity and access status' })
  async grafanaStatus() {
    return await this.monitoringService.getGrafanaStatus();
  }

  @Get('services/:serviceEnvId/links')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary:
      'Monitoring links (Grafana/Prometheus/Loki) for the server hosting a service-environment',
  })
  async serviceMonitoringLinks(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
  ) {
    await this.access.assertServiceEnv(serviceEnvId, user.id, user.role);
    return await this.monitoringService.getMonitoringLinksForServiceEnv(
      serviceEnvId,
    );
  }

  @Get('alerts')
  @Roles(Role.ADMIN, Role.DEVELOPER)
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
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({ summary: 'Get container stats and logs for a deployment' })
  async containerInfo(
    @Param('deploymentId') deploymentId: string,
    @GetUser() user: JwtPayload,
    @Query('tail', new DefaultValuePipe(200), ParseIntPipe) tail: number,
  ) {
    await this.access.assertDeployment(deploymentId, user.id, user.role);
    return await this.containerMonitoring.getContainerInfo(deploymentId, tail);
  }

  @Get('containers/project/:projectId')
  @Roles(Role.ADMIN, Role.DEVELOPER)
  @ApiOperation({
    summary: 'List running containers for a project on a server',
  })
  async projectContainers(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
    @Query('serverId') serverId: string,
  ) {
    await this.access.assertProject(projectId, user.id, user.role);
    return await this.containerMonitoring.listProjectContainers(
      projectId,
      serverId,
    );
  }
}
