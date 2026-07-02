import { Injectable } from '@nestjs/common';
import { DeploymentStatus, Prisma, Role, ServerStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { activeWhere } from '../../../shared/database/prisma-active.helper';

export type DayActivity = {
  date: string;
  total: number;
  success: number;
  failed: number;
};

export type TopProject = {
  id: string;
  name: string;
  deployCount: number;
  lastDeployedAt: string | null;
  successRate: number;
};

export type DashboardStats = {
  kpis: {
    totalProjects: number;
    totalEnvironments: number;
    totalServers: number;
    deploymentsLast7d: number;
    deploymentsLast30d: number;
    successRate7d: number;
    avgDurationSeconds: number | null;
    runningCount: number;
    failedCount: number;
    idleProjectsCount: number;
  };
  activity: DayActivity[];
  topProjects: TopProject[];
  servers: {
    total: number;
    ready: number;
    preparing: number;
    error: number;
    offline: number;
  };
  recentFailures: {
    id: string;
    projectName: string;
    environmentName: string;
    branch: string;
    createdAt: string;
  }[];
};

const SUCCESS: DeploymentStatus[] = ['SUCCESS'];
const FAILED: DeploymentStatus[] = ['FAILED', 'CANCELED'];
const RUNNING: DeploymentStatus[] = ['PENDING', 'RUNNING'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string, userRole: Role): Promise<DashboardStats> {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 86400_000);
    const since30d = new Date(now.getTime() - 30 * 86400_000);

    // Non-admins only see the projects they are a member of — the dashboard
    // must not leak other projects' names, deploy counts or failures. Admins
    // (projectIds === null) see the whole platform.
    const projectIds =
      userRole === Role.ADMIN
        ? null
        : (
            await this.prisma.projectMember.findMany({
              where: { userId },
              select: { projectId: true },
            })
          ).map((m) => m.projectId);
    const projectIn = projectIds ? { in: projectIds } : undefined;
    const deployScope: Prisma.DeploymentWhereInput = projectIn
      ? { projectId: projectIn }
      : {};
    // Servers are platform infra: scope to those attached to the caller's
    // projects' environments (admins see all). Archived servers are excluded
    // from every dashboard count/list (activeWhere) — an archived VPS should
    // not inflate "total servers" nor show up in health breakdowns.
    const serverScope: Prisma.ServerWhereInput = activeWhere(
      projectIn ? { environment: { projectId: projectIn } } : {},
    );

    const [
      totalProjects,
      totalEnvironments,
      totalServers,
      deployments30d,
      running,
      allServers,
      recentFailures,
    ] = await Promise.all([
      this.prisma.project.count(
        projectIn ? { where: { id: projectIn } } : undefined,
      ),
      this.prisma.environment.count(
        projectIn ? { where: { projectId: projectIn } } : undefined,
      ),
      this.prisma.server.count({ where: serverScope }),
      this.prisma.deployment.findMany({
        where: { createdAt: { gte: since30d }, ...deployScope },
        select: {
          id: true,
          status: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          projectId: true,
          project: { select: { id: true, name: true } },
          environment: { select: { name: true } },
          branch: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deployment.count({
        where: { status: { in: RUNNING }, ...deployScope },
      }),
      this.prisma.server.findMany({
        where: serverScope,
        select: { status: true },
      }),
      this.prisma.deployment.findMany({
        where: {
          status: { in: FAILED },
          createdAt: { gte: since7d },
          ...deployScope,
        },
        select: {
          id: true,
          branch: true,
          createdAt: true,
          project: { select: { name: true } },
          environment: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const deployments7d = deployments30d.filter((d) => d.createdAt >= since7d);

    // Success rate (7d)
    const success7d = deployments7d.filter((d) =>
      SUCCESS.includes(d.status),
    ).length;
    const finished7d = deployments7d.filter(
      (d) => SUCCESS.includes(d.status) || FAILED.includes(d.status),
    ).length;
    const successRate7d =
      finished7d > 0 ? Math.round((success7d / finished7d) * 100) : 0;

    // Avg deployment duration (finished only, 30d)
    const withDuration = deployments30d.filter(
      (d) => d.startedAt && d.finishedAt,
    );
    const avgDurationSeconds =
      withDuration.length > 0
        ? Math.round(
            withDuration.reduce(
              (sum, d) =>
                sum + (d.finishedAt!.getTime() - d.startedAt!.getTime()) / 1000,
              0,
            ) / withDuration.length,
          )
        : null;

    // Idle projects (no deploy in last 7d)
    const activeProjectIds = new Set(deployments7d.map((d) => d.projectId));
    const idleProjectsCount = Math.max(
      totalProjects - activeProjectIds.size,
      0,
    );

    // Activity chart: last 7 days
    const activity: DayActivity[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      const dayDeploys = deployments7d.filter(
        (dep) => dep.createdAt >= d && dep.createdAt <= end,
      );
      return {
        date: d.toISOString().slice(0, 10),
        total: dayDeploys.length,
        success: dayDeploys.filter((dep) => SUCCESS.includes(dep.status))
          .length,
        failed: dayDeploys.filter((dep) => FAILED.includes(dep.status)).length,
      };
    });

    // Top 5 projects by deploy count (30d)
    const projectMap = new Map<
      string,
      {
        name: string;
        count: number;
        lastAt: Date | null;
        success: number;
        finished: number;
      }
    >();
    for (const d of deployments30d) {
      const existing = projectMap.get(d.projectId) ?? {
        name: d.project.name,
        count: 0,
        lastAt: null,
        success: 0,
        finished: 0,
      };
      existing.count++;
      if (!existing.lastAt || d.createdAt > existing.lastAt) {
        existing.lastAt = d.createdAt;
      }
      if (SUCCESS.includes(d.status)) existing.success++;
      if (SUCCESS.includes(d.status) || FAILED.includes(d.status)) {
        existing.finished++;
      }
      projectMap.set(d.projectId, existing);
    }

    const topProjects: TopProject[] = [...projectMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([id, v]) => ({
        id,
        name: v.name,
        deployCount: v.count,
        lastDeployedAt: v.lastAt?.toISOString() ?? null,
        successRate:
          v.finished > 0 ? Math.round((v.success / v.finished) * 100) : 0,
      }));

    // Server status breakdown
    const serverStatusCount = { ready: 0, preparing: 0, error: 0, offline: 0 };
    for (const s of allServers) {
      if (s.status === ServerStatus.PREPARED) serverStatusCount.ready++;
      else if (
        s.status === ServerStatus.PREPARING ||
        s.status === ServerStatus.PREPARATION_PENDING
      )
        serverStatusCount.preparing++;
      else if (
        s.status === ServerStatus.PREPARATION_FAILED ||
        s.status === ServerStatus.VALIDATION_FAILED ||
        s.status === ServerStatus.UNREACHABLE
      )
        serverStatusCount.error++;
      else serverStatusCount.offline++;
    }

    return {
      kpis: {
        totalProjects,
        totalEnvironments,
        totalServers,
        deploymentsLast7d: deployments7d.length,
        deploymentsLast30d: deployments30d.length,
        successRate7d,
        avgDurationSeconds,
        runningCount: running,
        failedCount: deployments7d.filter((d) => FAILED.includes(d.status))
          .length,
        idleProjectsCount,
      },
      activity,
      topProjects,
      servers: {
        total: totalServers,
        ...serverStatusCount,
      },
      recentFailures: recentFailures.map((f) => ({
        id: f.id,
        projectName: f.project.name,
        environmentName: f.environment.name,
        branch: f.branch,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }
}
