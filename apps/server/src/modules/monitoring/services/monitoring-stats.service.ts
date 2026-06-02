import { Injectable } from '@nestjs/common';
import { DeploymentStatus, PipelineStatus, ServerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';
import { AUTOMATION_ACTIONS } from '../../automation/shared/automation-options';
import type { MonitoringMetricSnapshot } from './monitoring-prometheus.service';

type MonitoringHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

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

@Injectable()
export class MonitoringStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getServerMonitoring(metricByHost: Map<string, MonitoringMetricSnapshot>) {
    const servers = await this.prisma.server.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        environments: {
          select: {
            projectId: true,
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const deploymentStatsByServer = await this.fetchDeploymentStatsByServer();

    return servers.map((server) => {
      const metrics = metricByHost.get(server.host) ?? {
        up: null,
        cpuPercent: null,
        memoryPercent: null,
        diskPercent: null,
        networkRxBytesPerSec: null,
        networkTxBytesPerSec: null,
        uptimeSeconds: null,
      };
      const deploymentStats = deploymentStatsByServer.get(server.id) ?? {
        lastStatus: null,
        lastDeploymentAt: null,
        failedInLast7d: 0,
        successInLast7d: 0,
      };

      const blockingReasons = this.resolveBlockingReasons(server);
      const monitoringStatus = this.resolveServerHealth(
        server.status,
        server.isVerified,
        metrics,
      );

      return {
        serverId: server.id,
        name: server.name,
        host: server.host,
        platformStatus: server.status,
        monitoringStatus,
        lastCheckAt:
          metrics.up !== null ||
          metrics.cpuPercent !== null ||
          metrics.memoryPercent !== null ||
          metrics.diskPercent !== null
            ? new Date().toISOString()
            : null,
        metrics,
        docker: {
          enabled: server.hasDocker,
          runnerEnabled: server.hasRunner,
        },
        linkedProjects: server.environments.map((env) => ({
          id: env.project.id,
          name: env.project.name,
        })),
        deployment: deploymentStats,
        blockingReasons,
      };
    });
  }

  async getProjectMonitoring() {
    const projects = await this.prisma.project.findMany({
      orderBy: { name: 'asc' },
      include: {
        environments: {
          select: {
            id: true,
            serverId: true,
          },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          select: {
            status: true,
            createdAt: true,
          },
        },
        pipelines: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            status: true,
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);

    return projects.map((project) => {
      const latestDeployment = project.deployments[0] ?? null;
      const deploymentsLast7d = project.deployments.filter(
        (deployment) => deployment.createdAt >= sevenDaysAgo,
      );
      const failedDeployments7d = deploymentsLast7d.filter(
        (deployment) =>
          deployment.status === DeploymentStatus.FAILED ||
          deployment.status === DeploymentStatus.CANCELED,
      ).length;
      const successDeployments7d = deploymentsLast7d.filter(
        (deployment) => deployment.status === DeploymentStatus.SUCCESS,
      ).length;
      const successRate7d =
        deploymentsLast7d.length > 0
          ? Math.round((successDeployments7d / deploymentsLast7d.length) * 100)
          : null;

      const pipelineStatusCounts = project.pipelines.reduce(
        (acc, pipeline) => {
          acc[pipeline.status] = (acc[pipeline.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<PipelineStatus, number>,
      );

      const health = this.resolveProjectHealth(
        latestDeployment?.status ?? null,
        failedDeployments7d,
      );

      return {
        projectId: project.id,
        name: project.name,
        linkedServers: Array.from(
          new Set(project.environments.map((env) => env.serverId)),
        ).length,
        latestDeploymentStatus: latestDeployment?.status ?? null,
        latestDeploymentAt: latestDeployment?.createdAt.toISOString() ?? null,
        deploymentsLast7d: deploymentsLast7d.length,
        failedDeployments7d,
        successRate7d,
        pipelineStatusCounts,
        health,
      };
    });
  }

  async getDeploymentMonitoring() {
    const deployments = await this.prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        project: {
          select: { id: true, name: true },
        },
        environment: {
          select: {
            id: true,
            name: true,
            server: {
              select: { id: true, name: true, host: true },
            },
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);
    const deploymentsLast7d = deployments.filter(
      (deployment) => deployment.createdAt >= sevenDaysAgo,
    );
    const success7d = deploymentsLast7d.filter(
      (deployment) => deployment.status === DeploymentStatus.SUCCESS,
    ).length;

    const stats = {
      total: deployments.length,
      pending: deployments.filter((d) => d.status === DeploymentStatus.PENDING)
        .length,
      running: deployments.filter((d) => d.status === DeploymentStatus.RUNNING)
        .length,
      succeeded: deployments.filter((d) => d.status === DeploymentStatus.SUCCESS)
        .length,
      failed: deployments.filter((d) => d.status === DeploymentStatus.FAILED)
        .length,
      canceled: deployments.filter((d) => d.status === DeploymentStatus.CANCELED)
        .length,
      successRate7d:
        deploymentsLast7d.length > 0
          ? Math.round((success7d / deploymentsLast7d.length) * 100)
          : null,
    };

    return {
      generatedAt: new Date().toISOString(),
      stats,
      recent: deployments.map((deployment) => ({
        id: deployment.id,
        status: deployment.status,
        buildStatus: deployment.buildStatus,
        branch: deployment.branch,
        dockerImage: deployment.dockerImage,
        createdAt: deployment.createdAt.toISOString(),
        startedAt: deployment.startedAt?.toISOString() ?? null,
        finishedAt: deployment.finishedAt?.toISOString() ?? null,
        project: deployment.project,
        environment: {
          id: deployment.environment.id,
          name: deployment.environment.name,
        },
        server: deployment.environment.server,
      })),
    };
  }

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

    const deploymentAlerts: AlertItem[] = failedDeployments.map((deployment) => ({
      id: `deployment-${deployment.id}`,
      severity: 'warning',
      status: 'firing',
      summary: `Failed deployment on project ${deployment.project.name}`,
      source: 'platform',
      startsAt: deployment.createdAt.toISOString(),
      projectId: deployment.projectId,
    }));

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

  private async fetchDeploymentStatsByServer() {
    const deployments = await this.prisma.deployment.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        createdAt: true,
        environment: {
          select: {
            serverId: true,
          },
        },
      },
    });

    const sevenDaysAgo = this.daysAgo(7);
    const map = new Map<
      string,
      {
        lastStatus: DeploymentStatus | null;
        lastDeploymentAt: string | null;
        failedInLast7d: number;
        successInLast7d: number;
      }
    >();

    for (const deployment of deployments) {
      const serverId = deployment.environment.serverId;
      const current = map.get(serverId) ?? {
        lastStatus: null,
        lastDeploymentAt: null,
        failedInLast7d: 0,
        successInLast7d: 0,
      };

      if (!current.lastStatus) {
        current.lastStatus = deployment.status;
        current.lastDeploymentAt = deployment.createdAt.toISOString();
      }

      if (deployment.createdAt >= sevenDaysAgo) {
        if (
          deployment.status === DeploymentStatus.FAILED ||
          deployment.status === DeploymentStatus.CANCELED
        ) {
          current.failedInLast7d += 1;
        }
        if (deployment.status === DeploymentStatus.SUCCESS) {
          current.successInLast7d += 1;
        }
      }

      map.set(serverId, current);
    }

    return map;
  }

  private resolveServerHealth(
    status: ServerStatus,
    isVerified: boolean,
    metrics: MonitoringMetricSnapshot,
  ): MonitoringHealth {
    if (status === ServerStatus.UNREACHABLE) {
      return 'CRITICAL';
    }
    if (!isVerified) {
      return 'WARNING';
    }

    if (metrics.up === 0) {
      return 'CRITICAL';
    }

    const values = [
      metrics.cpuPercent,
      metrics.memoryPercent,
      metrics.diskPercent,
    ].filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );

    if (values.some((value) => value >= 95)) {
      return 'CRITICAL';
    }
    if (values.some((value) => value >= 85)) {
      return 'WARNING';
    }

    if (metrics.up !== null && metrics.up > 0) {
      return 'HEALTHY';
    }

    return 'UNKNOWN';
  }

  private resolveProjectHealth(
    latestStatus: DeploymentStatus | null,
    failedDeployments7d: number,
  ): MonitoringHealth {
    if (latestStatus === DeploymentStatus.FAILED) {
      return 'CRITICAL';
    }
    if (latestStatus === DeploymentStatus.CANCELED) {
      return 'WARNING';
    }
    if (failedDeployments7d > 0) {
      return 'WARNING';
    }
    if (latestStatus === DeploymentStatus.SUCCESS) {
      return 'HEALTHY';
    }
    return 'UNKNOWN';
  }

  private resolveBlockingReasons(server: {
    status: ServerStatus;
    isVerified: boolean;
    lastPreparedAt: Date | null;
  }): string[] {
    const reasons: string[] = [];

    if (!server.isVerified) {
      reasons.push('SSH validation required');
    }
    if (server.status === ServerStatus.UNREACHABLE) {
      reasons.push('Server unreachable');
    }
    if (server.status === ServerStatus.PREPARATION_FAILED) {
      reasons.push('Preparation failed');
    }
    if (!server.lastPreparedAt) {
      reasons.push('Preparation required');
    }

    return reasons;
  }

  private daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
