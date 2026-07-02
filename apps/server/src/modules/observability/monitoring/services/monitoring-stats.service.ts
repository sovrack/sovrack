import { Injectable } from '@nestjs/common';
import {
  DeploymentStatus,
  PipelineRunStatus,
  ServerStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { activeWhere } from '../../../../shared/database/prisma-active.helper';
import type { MonitoringMetricSnapshot } from './monitoring-prometheus.service';
import {
  serverHasDocker,
  serverHasRunner,
} from '../../../../adapters/server-capabilities/server-capabilities.util';

type MonitoringHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

@Injectable()
export class MonitoringStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getServerMonitoring(
    metricByHost: Map<string, MonitoringMetricSnapshot>,
  ) {
    const servers = await this.prisma.server.findMany({
      where: activeWhere({ isActive: true }),
      orderBy: { name: 'asc' },
      take: 200,
    });

    const serverIds = servers.map((s) => s.id);

    // Get linked projects via containers -> deployments -> project
    const containers = await this.prisma.container.findMany({
      where: { serverId: { in: serverIds } },
      select: {
        serverId: true,
        deployment: {
          select: {
            projectId: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    const projectsByServer = new Map<
      string,
      Map<string, { id: string; name: string }>
    >();
    for (const c of containers) {
      if (!c.deployment) continue;
      if (!projectsByServer.has(c.serverId)) {
        projectsByServer.set(c.serverId, new Map());
      }
      const pm = projectsByServer.get(c.serverId)!;
      if (!pm.has(c.deployment.projectId)) {
        pm.set(c.deployment.projectId, c.deployment.project);
      }
    }

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
          enabled: serverHasDocker(server),
          runnerEnabled: serverHasRunner(server),
        },
        linkedProjects: Array.from(
          (projectsByServer.get(server.id) ?? new Map()).values(),
        ),
        deployment: deploymentStats,
        blockingReasons,
      };
    });
  }

  async getProjectMonitoring() {
    const projects = await this.prisma.project.findMany({
      orderBy: { name: 'asc' },
      take: 100,
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            status: true,
            createdAt: true,
          },
        },
        pipelineRuns: {
          orderBy: { createdAt: 'desc' },
          take: 25,
          select: {
            status: true,
          },
        },
      },
    });

    // Get linked server counts via containers -> deployments -> projects
    const projectIds = projects.map((p) => p.id);
    const deploymentContainers = await this.prisma.container.findMany({
      where: {
        deployment: { projectId: { in: projectIds } },
      },
      select: {
        serverId: true,
        deployment: { select: { projectId: true } },
      },
    });

    const serversByProject = new Map<string, Set<string>>();
    for (const dc of deploymentContainers) {
      if (!dc.deployment) continue;
      if (!serversByProject.has(dc.deployment.projectId)) {
        serversByProject.set(dc.deployment.projectId, new Set());
      }
      serversByProject.get(dc.deployment.projectId)!.add(dc.serverId);
    }

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

      const pipelineStatusCounts = project.pipelineRuns.reduce(
        (acc, run) => {
          acc[run.status] = (acc[run.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<PipelineRunStatus, number>,
      );

      const health = this.resolveProjectHealth(
        latestDeployment?.status ?? null,
        failedDeployments7d,
      );

      return {
        projectId: project.id,
        name: project.name,
        linkedServers: (serversByProject.get(project.id) ?? new Set()).size,
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
        build: { select: { status: true } },
        project: {
          select: { id: true, name: true },
        },
        environment: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Get server info via containers for deployment list
    const deploymentIds = deployments.map((d) => d.id);
    const deploymentContainers = await this.prisma.container.findMany({
      where: { deploymentId: { in: deploymentIds } },
      select: {
        deploymentId: true,
        server: { select: { id: true, name: true, host: true } },
      },
    });
    const serverByDeploymentId = new Map(
      deploymentContainers
        .filter((c) => c.deploymentId)
        .map((c) => [c.deploymentId, c.server]),
    );

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
      succeeded: deployments.filter(
        (d) => d.status === DeploymentStatus.SUCCESS,
      ).length,
      failed: deployments.filter((d) => d.status === DeploymentStatus.FAILED)
        .length,
      canceled: deployments.filter(
        (d) => d.status === DeploymentStatus.CANCELED,
      ).length,
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
        buildStatus: deployment.build?.status ?? null,
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
        server: serverByDeploymentId.get(deployment.id) ?? null,
      })),
    };
  }

  private async fetchDeploymentStatsByServer() {
    const containers = await this.prisma.container.findMany({
      take: 500,
      where: { deploymentId: { not: null } },
      select: {
        serverId: true,
        deployment: {
          select: {
            status: true,
            createdAt: true,
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

    for (const container of containers) {
      if (!container.deployment) continue;
      const serverId = container.serverId;
      const deployment = container.deployment;
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
