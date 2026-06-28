import { Injectable } from '@nestjs/common';
import { DeploymentStatus, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { AUTOMATION_ACTIONS } from '../../../automation';

type AlertItem = {
  id: string;
  severity: 'warning' | 'critical' | 'info';
  status: 'firing' | 'resolved';
  summary: string;
  source: 'alertmanager' | 'platform';
  startsAt: string;
  serverId?: string;
  projectId?: string;
};

/**
 * Options d'installation de la stack monitoring (actions Ansible allowlistées +
 * serveurs cibles) et alertes dérivées de l'état plateforme (serveurs
 * injoignables, déploiements échoués). Extrait de MonitoringStatsService pour
 * isoler le « catalogue + alertes » des statistiques de monitoring brutes.
 */
@Injectable()
export class MonitoringAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInstallOptions() {
    const actions = AUTOMATION_ACTIONS.filter(
      (action) => action.category === 'monitoring',
    );
    const servers = await this.prisma.server.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        host: true,
        status: true,
        isVerified: true,
      },
    });

    return {
      executionModel:
        'Control node only (Ansible remains on backend). Target VPS hosts remain agentless SSH targets.',
      actions,
      servers,
    };
  }

  async getDerivedAlerts() {
    const servers = await this.prisma.server.findMany({
      where: {
        OR: [
          { status: ServerStatus.UNREACHABLE },
          { status: ServerStatus.PREPARATION_FAILED },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    const failedDeployments = await this.prisma.deployment.findMany({
      where: {
        status: DeploymentStatus.FAILED,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        project: {
          select: {
            name: true,
          },
        },
      },
    });

    const serverAlerts: AlertItem[] = servers.map((server) => ({
      id: `server-${server.id}`,
      severity: 'critical',
      status: 'firing',
      summary: `${server.name}: ${server.status === ServerStatus.UNREACHABLE ? 'server unreachable' : 'preparation failed'}`,
      source: 'platform',
      startsAt: new Date().toISOString(),
      serverId: server.id,
    }));

    const deploymentAlerts: AlertItem[] = failedDeployments.map(
      (deployment) => ({
        id: `deployment-${deployment.id}`,
        severity: 'warning',
        status: 'firing',
        summary: `Failed deployment on project ${deployment.project.name}`,
        source: 'platform',
        startsAt: deployment.createdAt.toISOString(),
        projectId: deployment.projectId,
      }),
    );

    const items = [...serverAlerts, ...deploymentAlerts];

    return {
      source: 'derived',
      total: items.length,
      warning: items.filter((item) => item.severity === 'warning').length,
      critical: items.filter((item) => item.severity === 'critical').length,
      info: items.filter((item) => item.severity === 'info').length,
      items,
    };
  }
}
