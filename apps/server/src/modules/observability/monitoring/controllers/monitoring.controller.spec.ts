import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { MonitoringService } from '../services/monitoring.service';
import { MonitoringAccessService } from '../services/monitoring-access.service';
import { ContainerStatsService } from '../../../infrastructure/containers/services/container-stats.service';
import { MonitoringController } from './monitoring.controller';

describe('MonitoringController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const monitoringService = {
      getOverview: jest.fn().mockResolvedValue({}),
      getServerMonitoring: jest.fn().mockResolvedValue([]),
      getProjectMonitoring: jest.fn().mockResolvedValue([]),
      getDeploymentMonitoring: jest.fn().mockResolvedValue([]),
      getPrometheusStatus: jest.fn().mockResolvedValue({ up: true }),
      getServerMetricRange: jest.fn().mockResolvedValue([]),
      getGrafanaStatus: jest.fn().mockResolvedValue({ up: true }),
      getAlerts: jest.fn().mockResolvedValue([]),
      getInstallOptions: jest.fn().mockResolvedValue({}),
      installMonitoring: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as MonitoringService;
    const containerMonitoring = {
      getContainerInfo: jest.fn().mockResolvedValue({}),
      listProjectContainers: jest.fn().mockResolvedValue([]),
    } as unknown as ContainerStatsService;
    const access = {
      assertProject: jest.fn().mockResolvedValue(undefined),
      assertServiceEnv: jest.fn().mockResolvedValue(undefined),
      assertDeployment: jest.fn().mockResolvedValue(undefined),
    } as unknown as MonitoringAccessService;
    const ctrl = new MonitoringController(
      monitoringService,
      access,
      containerMonitoring,
    );
    return { ctrl, monitoringService, containerMonitoring, access };
  }

  it('read endpoints delegate to the monitoring service', async () => {
    const { ctrl, monitoringService } = build();
    await ctrl.overview();
    await ctrl.servers();
    await ctrl.projects();
    await ctrl.deployments();
    await ctrl.prometheusStatus();
    await ctrl.grafanaStatus();
    await ctrl.alerts();
    await ctrl.installOptions();
    expect(monitoringService.getOverview).toHaveBeenCalled();
    expect(monitoringService.getServerMonitoring).toHaveBeenCalled();
    expect(monitoringService.getProjectMonitoring).toHaveBeenCalled();
    expect(monitoringService.getDeploymentMonitoring).toHaveBeenCalled();
    expect(monitoringService.getPrometheusStatus).toHaveBeenCalled();
    expect(monitoringService.getGrafanaStatus).toHaveBeenCalled();
    expect(monitoringService.getAlerts).toHaveBeenCalled();
    expect(monitoringService.getInstallOptions).toHaveBeenCalled();
  });

  it('serverMetricRange / install forward parameters', async () => {
    const { ctrl, monitoringService } = build();
    await ctrl.serverMetricRange('host-1', 30, 15);
    await ctrl.install({ action: 'INSTALL' } as never, user);
    expect(monitoringService.getServerMetricRange).toHaveBeenCalledWith(
      'host-1',
      30,
      15,
    );
    expect(monitoringService.installMonitoring).toHaveBeenCalledWith(
      { action: 'INSTALL' },
      'user-1',
    );
  });

  it('container endpoints assert project access then delegate (LOT1a)', async () => {
    const { ctrl, containerMonitoring, access } = build();
    await ctrl.containerInfo('d1', user, 100);
    await ctrl.projectContainers('p1', user, 's1');
    expect(access.assertDeployment).toHaveBeenCalledWith(
      'd1',
      'user-1',
      Role.ADMIN,
    );
    expect(access.assertProject).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.ADMIN,
    );
    expect(containerMonitoring.getContainerInfo).toHaveBeenCalledWith(
      'd1',
      100,
    );
    expect(containerMonitoring.listProjectContainers).toHaveBeenCalledWith(
      'p1',
      's1',
    );
  });
});
