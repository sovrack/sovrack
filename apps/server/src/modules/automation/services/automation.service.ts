import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ServerOperationStatus,
  ServerOperationTargetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { CreateAutomationRunDto } from '../dto/create-automation-run.dto';
import {
  AUTOMATION_ACTIONS,
  getAutomationAction,
} from '../shared/automation-options';
import { AutomationRunnerService } from './automation-runner.service';

const ACTIVE_RUN_STATUSES: ServerOperationStatus[] = [
  ServerOperationStatus.QUEUED,
  ServerOperationStatus.RUNNING,
];

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AutomationRunnerService,
  ) {}

  getActions() {
    return AUTOMATION_ACTIONS;
  }

  async getRuns(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.serverOperation.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: { select: { id: true, fullName: true, email: true } },
          targets: {
            include: {
              server: { select: { id: true, name: true, host: true } },
            },
          },
        },
      }),
      this.prisma.serverOperation.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async getRun(id: string) {
    const run = await this.prisma.serverOperation.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, fullName: true, email: true } },
        targets: {
          include: {
            server: { select: { id: true, name: true, host: true } },
          },
          orderBy: { id: 'asc' },
        },
        logs: { orderBy: { lineNumber: 'asc' } },
      },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    return run;
  }

  async getRunLogs(id: string, afterLine?: number) {
    const run = await this.prisma.serverOperation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Automation run not found');

    return await this.prisma.serverOperationLog.findMany({
      where: {
        operationId: id,
        ...(afterLine ? { lineNumber: { gt: afterLine } } : {}),
      },
      orderBy: { lineNumber: 'asc' },
      take: 1_000,
    });
  }

  async startRun(dto: CreateAutomationRunDto, actorId?: string) {
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
      where: { id: { in: serverIds }, isActive: true },
      select: { id: true },
    });

    if (servers.length !== serverIds.length) {
      throw new BadRequestException(
        'Some selected servers are missing or disabled',
      );
    }

    const run = await this.prisma.serverOperation.create({
      data: {
        actionKey: action.key,
        actionLabel: action.label,
        status: ServerOperationStatus.QUEUED,
        requestedById: actorId,
        paramsJson: {
          selected_roles: action.roles ?? [],
          gitlabRunnerExecutor: dto.gitlabRunnerExecutor?.trim() || 'docker',
        } as Prisma.InputJsonValue,
        targets: {
          create: serverIds.map((serverId) => ({
            serverId,
            status: ServerOperationTargetStatus.PENDING,
          })),
        },
      },
      include: {
        requestedBy: { select: { id: true, fullName: true, email: true } },
        targets: {
          include: {
            server: { select: { id: true, name: true, host: true } },
          },
        },
      },
    });

    await this.prisma.auditLog.createMany({
      data: serverIds.map((serverId) => ({
        resourceType: 'SERVER',
        resourceId: serverId,
        userId: actorId ?? null,
        action: 'AUTOMATION_RUN_REQUESTED',
        metadata: {
          runId: run.id,
          actionKey: action.key,
          actionLabel: action.label,
        } as Prisma.InputJsonValue,
      })),
    });

    this.runner.executeInBackground(run.id);
    return run;
  }

  async cancelRun(id: string, actorId?: string) {
    const run = await this.prisma.serverOperation.findUnique({
      where: { id },
      include: {
        targets: { select: { serverId: true } },
      },
    });
    if (!run) throw new NotFoundException('Automation run not found');
    if (!ACTIVE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException(
        'This automation run can no longer be canceled',
      );
    }

    await this.prisma.serverOperation.update({
      where: { id },
      data: {
        status: ServerOperationStatus.CANCELED,
        summary: 'Automation canceled by administrator.',
        finishedAt: new Date(),
      },
    });
    this.runner.cancel(id);

    if (run.targets.length > 0) {
      await this.prisma.auditLog.createMany({
        data: run.targets.map((target) => ({
          resourceType: 'SERVER',
          resourceId: target.serverId,
          userId: actorId ?? null,
          action: 'AUTOMATION_RUN_CANCELED',
          metadata: { runId: id } as Prisma.InputJsonValue,
        })),
      });
    }

    return await this.getRun(id);
  }

  async deleteRun(id: string) {
    const run = await this.prisma.serverOperation.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Automation run not found');
    if (ACTIVE_RUN_STATUSES.includes(run.status)) {
      throw new BadRequestException('Cannot delete an active run. Cancel it first.');
    }
    await this.prisma.serverOperationLog.deleteMany({ where: { operationId: id } });
    await this.prisma.serverOperation.delete({ where: { id } });
    return { deleted: true };
  }
}
