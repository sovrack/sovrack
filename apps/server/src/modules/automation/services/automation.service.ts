import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ServerRunKind,
  ServerRunStatus,
  ServerRunStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { activeWhere } from '../../../shared/database/prisma-active.helper';
import { ServerRunsService } from '../../infrastructure/server-runs/server-runs.service';
import { CreateAutomationRunDto } from '../dto/create-automation-run.dto';
import { AutomationPaginationDto } from '../dto/automation-pagination.dto';
import {
  AUTOMATION_ACTIONS,
  getAutomationAction,
} from '../shared/automation-options';
import { AutomationRunnerService } from './automation-runner.service';
import { QueueService } from '../../../shared/queue/queue.service';

const ACTIVE_RUN_STATUSES: ServerRunStatus[] = [
  ServerRunStatus.QUEUED,
  ServerRunStatus.RUNNING,
];

// Each AUTOMATION ServerRun persists one ServerRunStep per targeted server.
// The legacy API exposed these as `targets`, so we keep that field name in the
// response shape (the frontend reads `run.targets`).
const runListInclude = {
  requestedBy: { select: { id: true, fullName: true, email: true } },
  steps: {
    include: { server: { select: { id: true, name: true, host: true } } },
  },
} satisfies Prisma.ServerRunInclude;

const runDetailInclude = {
  requestedBy: { select: { id: true, fullName: true, email: true } },
  steps: {
    include: { server: { select: { id: true, name: true, host: true } } },
    orderBy: { id: 'asc' },
  },
  logs: { orderBy: { lineNumber: 'asc' } },
} satisfies Prisma.ServerRunInclude;

type AutomationRunRow = Prisma.ServerRunGetPayload<{
  include: typeof runListInclude;
}>;
type AutomationRunDetailRow = Prisma.ServerRunGetPayload<{
  include: typeof runDetailInclude;
}>;

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AutomationRunnerService,
    private readonly serverRuns: ServerRunsService,
    private readonly queue: QueueService,
  ) {}

  getActions() {
    return AUTOMATION_ACTIONS;
  }

  async getRuns(workspaceId: string, pagination?: AutomationPaginationDto) {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.serverRun.findMany({
        where: { teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: runListInclude,
      }),
      this.prisma.serverRun.count({
        where: { teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
      }),
    ]);
    return {
      items: items.map((run) => this.toAutomationRunShape(run)),
      total,
      page,
      pageSize,
    };
  }

  async getRun(id: string, workspaceId: string) {
    const run = await this.prisma.serverRun.findFirst({
      where: { id, teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
      include: runDetailInclude,
    });
    if (!run) throw new NotFoundException('Automation run not found');
    return this.toAutomationRunShape(run);
  }

  async getRunLogs(id: string, workspaceId: string, afterLine?: number) {
    const run = await this.prisma.serverRun.findFirst({
      where: { id, teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    return this.serverRuns.getLogs(id, afterLine);
  }

  async startRun(
    dto: CreateAutomationRunDto,
    workspaceId: string,
    actorId?: string,
  ) {
    const action = getAutomationAction(dto.actionKey);
    if (!action) {
      throw new BadRequestException(`Unknown action: ${dto.actionKey}`);
    }

    if (!Array.isArray(action.roles) || action.roles.length === 0) {
      throw new BadRequestException(
        `Automation action ${dto.actionKey} has no role mapping`,
      );
    }

    const serverIds = Array.from(new Set(dto.serverIds.map((id) => id.trim())));
    if (serverIds.length === 0) {
      throw new BadRequestException('No target servers provided');
    }

    const servers = await this.prisma.server.findMany({
      where: activeWhere({
        id: { in: serverIds },
        teamId: workspaceId,
        isActive: true,
      }),
      select: { id: true },
    });

    if (servers.length !== serverIds.length) {
      throw new BadRequestException(
        'Some selected servers are missing or disabled',
      );
    }

    const run = await this.prisma.serverRun.create({
      data: {
        kind: ServerRunKind.AUTOMATION,
        teamId: workspaceId,
        actionKey: action.key,
        actionLabel: action.label,
        status: ServerRunStatus.QUEUED,
        requestedById: actorId,
        paramsJson: {
          selected_roles: action.roles ?? [],
          gitlabRunnerExecutor: dto.gitlabRunnerExecutor?.trim() || 'docker',
        } as Prisma.InputJsonValue,
        steps: {
          create: serverIds.map((serverId) => ({
            serverId,
            status: ServerRunStepStatus.PENDING,
          })),
        },
      },
      include: runListInclude,
    });

    await this.prisma.auditLog.createMany({
      data: serverIds.map((serverId) => ({
        resourceType: 'SERVER',
        resourceId: serverId,
        teamId: workspaceId,
        userId: actorId ?? null,
        action: 'AUTOMATION_RUN_REQUESTED',
        metadata: {
          runId: run.id,
          actionKey: action.key,
          actionLabel: action.label,
        } as Prisma.InputJsonValue,
      })),
    });

    this.logger.log(
      `Automation run ${run.id} (${action.key}) started on ${String(serverIds.length)} server(s)`,
    );
    // Hand the Ansible run to the worker process via the automation-runs queue
    // (in single-process mode the same process consumes it).
    await this.queue.enqueueAutomationRun({ workspaceId, runId: run.id });
    return this.toAutomationRunShape(run);
  }

  async cancelRun(id: string, workspaceId: string, actorId?: string) {
    const run = await this.prisma.serverRun.findFirst({
      where: { id, teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
      include: {
        steps: { select: { serverId: true } },
      },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        'This automation run can no longer be canceled',
      );
    }

    await this.prisma.serverRun.update({
      where: { id },
      data: {
        status: ServerRunStatus.CANCELED,
        summary: 'Automation canceled by administrator.',
        finishedAt: new Date(),
      },
    });
    await this.runner.cancel(id);
    this.logger.warn(`Automation run ${id} canceled by administrator`);

    const canceledServerIds = run.steps
      .map((step) => step.serverId)
      .filter((serverId): serverId is string => Boolean(serverId));
    if (canceledServerIds.length > 0) {
      await this.prisma.auditLog.createMany({
        data: canceledServerIds.map((serverId) => ({
          resourceType: 'SERVER',
          resourceId: serverId,
          teamId: workspaceId,
          userId: actorId ?? null,
          action: 'AUTOMATION_RUN_CANCELED',
          metadata: { runId: id } as Prisma.InputJsonValue,
        })),
      });
    }

    return await this.getRun(id, workspaceId);
  }

  async deleteRun(id: string, workspaceId: string) {
    const run = await this.prisma.serverRun.findFirst({
      where: { id, teamId: workspaceId, kind: ServerRunKind.AUTOMATION },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    if (ACTIVE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        'Cannot delete an active run. Cancel it first.',
      );
    }
    // ServerRunStep and ServerRunLog cascade-delete with the run.
    await this.prisma.serverRun.delete({ where: { id } });
    this.logger.log(`Automation run ${id} deleted`);
    return { deleted: true };
  }

  /**
   * Maps a unified ServerRun into the legacy AutomationRun response shape the
   * frontend expects: the per-server ServerRunSteps are surfaced as `targets`.
   */
  private toAutomationRunShape(run: AutomationRunRow | AutomationRunDetailRow) {
    const { steps, ...rest } = run;
    return {
      ...rest,
      targets: steps.map((step) => ({
        id: step.id,
        runId: step.runId,
        serverId: step.serverId,
        status: step.status,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
        errorMessage: step.errorMessage,
        server: step.server,
      })),
    };
  }
}
