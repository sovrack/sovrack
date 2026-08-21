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
import { GetUser } from '../../../../shared/decorators/get-user.decorator';
import { GetWorkspaceId } from '../../../../shared/decorators/get-workspace-id.decorator';
import { JwtAuthGuard } from '../../../../shared/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../../iam/authorization/workspace.guard';
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
@Controller(['workspaces/:workspaceId/monitoring', 'monitoring'])
@UseGuards(JwtAuthGuard)
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly access: MonitoringAccessService,
    private readonly containerMonitoring: ContainerStatsService,
  ) {}

  @Get('overview')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({ summary: 'Monitoring overview for platform operations' })
  async overview(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getOverview(workspaceId);
  }

  @Get('servers')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({ summary: 'Server monitoring status and metric snapshots' })
  async servers(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getServerMonitoring(workspaceId);
  }

  @Get('projects')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary: 'Project monitoring linked to deployments/pipelines',
  })
  async projects(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getProjectMonitoring(workspaceId);
  }

  @Get('deployments')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({ summary: 'Deployment health and history monitoring' })
  async deployments(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getDeploymentMonitoring(workspaceId);
  }

  @Get('prometheus/status')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({ summary: 'Prometheus connectivity and target status' })
  async prometheusStatus() {
    return await this.monitoringService.getPrometheusStatus();
  }

  @Get('servers/:host/metrics/range')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary:
      'Historical CPU/mem/disk time-series for a host (Prometheus range)',
  })
  async serverMetricRange(
    @Param('host') host: string,
    @GetWorkspaceId() workspaceId: string,
    @Query('minutes', new DefaultValuePipe(60), ParseIntPipe) minutes: number,
    @Query('step', new DefaultValuePipe(60), ParseIntPipe) step: number,
  ) {
    return await this.monitoringService.getServerMetricRange(
      host,
      minutes,
      step,
      workspaceId,
    );
  }

  @Get('services/:serviceEnvId/metrics/range')
  @ApiOperation({
    summary:
      'Historical CPU/memory time-series for a service-environment (Prometheus range)',
  })
  async serviceMetricRange(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string | undefined,
    @Query('minutes', new DefaultValuePipe(60), ParseIntPipe) minutes: number,
    @Query('step', new DefaultValuePipe(60), ParseIntPipe) step: number,
  ) {
    await this.access.assertServiceEnv(
      serviceEnvId,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.monitoringService.getServiceMetricRange(
      serviceEnvId,
      minutes,
      step,
    );
  }

  @Get('grafana/status')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({ summary: 'Grafana connectivity and access status' })
  async grafanaStatus() {
    return await this.monitoringService.getGrafanaStatus();
  }

  @Get('services/:serviceEnvId/links')
  @ApiOperation({
    summary:
      'Monitoring links (Grafana/Prometheus/Loki) for the server hosting a service-environment',
  })
  async serviceMonitoringLinks(
    @Param('serviceEnvId') serviceEnvId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string | undefined,
  ) {
    await this.access.assertServiceEnv(
      serviceEnvId,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.monitoringService.getMonitoringLinksForServiceEnv(
      serviceEnvId,
    );
  }

  @Get('alerts')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary: 'Monitoring alerts (Alertmanager or derived alerts)',
  })
  async alerts(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getAlerts(workspaceId);
  }

  @Get('install/options')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary: 'Monitoring installation actions and eligible servers',
  })
  async installOptions(@GetWorkspaceId() workspaceId: string) {
    return await this.monitoringService.getInstallOptions(workspaceId);
  }

  @Post('install')
  @UseGuards(WorkspaceGuard)
  @ApiOperation({
    summary:
      'Install monitoring components through allowlisted automation actions',
  })
  async install(
    @Body() dto: InstallMonitoringDto,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string,
  ) {
    return await this.monitoringService.installMonitoring(
      dto,
      workspaceId,
      user.id,
    );
  }

  /* ── Container monitoring ────────────────────────────────────────────── */

  @Get('containers/deployment/:deploymentId')
  @ApiOperation({ summary: 'Get container stats and logs for a deployment' })
  async containerInfo(
    @Param('deploymentId') deploymentId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string | undefined,
    @Query('tail', new DefaultValuePipe(200), ParseIntPipe) tail: number,
  ) {
    await this.access.assertDeployment(
      deploymentId,
      user.id,
      user.role,
      workspaceId,
    );
    return await this.containerMonitoring.getContainerInfo(deploymentId, tail);
  }

  @Get('containers/project/:projectId')
  @ApiOperation({
    summary: 'List running containers for a project on a server',
  })
  async projectContainers(
    @Param('projectId') projectId: string,
    @GetUser() user: JwtPayload,
    @GetWorkspaceId() workspaceId: string | undefined,
    @Query('serverId') serverId: string,
  ) {
    await this.access.assertProject(projectId, user.id, user.role, workspaceId);
    return await this.containerMonitoring.listProjectContainers(
      projectId,
      serverId,
    );
  }
}
