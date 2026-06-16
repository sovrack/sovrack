import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ServerOperationStatus,
  ServerOperationTargetStatus,
  Prisma,
  Server,
  ServerLogLevel,
} from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ServerPreparationAnsibleService } from '../../infrastructure/preparation/services/server-preparation-ansible.service';
import type { PreparationRoleKey } from '../../infrastructure/servers/shared/server-preparation-options';
import { AutomationGateway } from '../automation.gateway';

type RunConfig = {
  roles: PreparationRoleKey[];
  gitlabRunnerExecutor: string;
};

type AutomationRunWithTargets = {
  id: string;
  status: ServerOperationStatus;
  actionKey: string;
  actionLabel: string;
  requestedById: string | null;
  paramsJson: Prisma.JsonValue;
  targets: Array<{
    id: string;
    server: Server;
  }>;
};

@Injectable()
export class AutomationRunnerService {
  private readonly logger = new Logger(AutomationRunnerService.name);
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ansible: ServerPreparationAnsibleService,
    private readonly gateway: AutomationGateway,
    private readonly configService: ConfigService,
  ) {}

  executeInBackground(runId: string): void {
    void this.executeRun(runId).catch((error: unknown) => {
      this.logger.error(
        `Automation run ${runId} execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  cancel(runId: string): void {
    this.controllers.get(runId)?.abort();
  }

  private async executeRun(runId: string): Promise<void> {
    const run = (await this.prisma.serverOperation.findUnique({
      where: { id: runId },
      include: {
        targets: {
          include: {
            server: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    })) as AutomationRunWithTargets | null;
    if (!run) {
      return;
    }
    if (run.status === ServerOperationStatus.CANCELED) {
      return;
    }

    const cfg = this.resolveRunConfig(run.paramsJson);
    const targetTimeoutMs = this.resolveTargetTimeoutMs();
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    let succeeded = 0;
    let failed = 0;
    let timedOut = 0;
    let skipped = 0;

    await this.prisma.serverOperation.update({
      where: { id: runId },
      data: {
        status: ServerOperationStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    this.gateway.emitRunStatus({
      runId,
      status: ServerOperationStatus.RUNNING,
    });

    await this.appendRunLog(runId, {
      level: ServerLogLevel.INFO,
      source: 'orchestrator',
      message:
        'Automation started from control node. Target VPS hosts remain SSH agentless.',
    });

    try {
      for (const target of run.targets) {
        if (controller.signal.aborted) {
          skipped += 1;
          await this.markTargetSkipped(
            target.id,
            'Run canceled by administrator',
          );
          continue;
        }

        const server = target.server;
        if (!server.isActive) {
          skipped += 1;
          await this.markTargetSkipped(target.id, 'Server disabled');
          await this.appendRunLog(runId, {
            serverId: server.id,
            level: ServerLogLevel.WARNING,
            source: 'orchestrator',
            message: `Skipping ${server.name}: server disabled.`,
          });
          continue;
        }

        if (!server.isVerified) {
          skipped += 1;
          await this.markTargetSkipped(target.id, 'SSH not validated');
          await this.appendRunLog(runId, {
            serverId: server.id,
            level: ServerLogLevel.WARNING,
            source: 'orchestrator',
            message: `Skipping ${server.name}: SSH is not validated.`,
          });
          continue;
        }

        await this.prisma.serverOperationTarget.update({
          where: { id: target.id },
          data: {
            status: ServerOperationTargetStatus.RUNNING,
            startedAt: new Date(),
            finishedAt: null,
            errorMessage: null,
          },
        });
        await this.prisma.auditLog.create({
          data: {
            resourceType: 'SERVER',
            resourceId: server.id,
            userId: run.requestedById ?? null,
            action: 'AUTOMATION_TARGET_START',
            metadata: {
              runId,
              actionKey: run.actionKey,
            } as Prisma.InputJsonValue,
          },
        });

        await this.appendRunLog(runId, {
          serverId: server.id,
          level: ServerLogLevel.INFO,
          source: 'orchestrator',
          message: `Running ${run.actionLabel} on ${server.name} (${server.host}).`,
        });

        try {
          await this.ansible.runPreparation(
            server,
            {
              roles: cfg.roles,
              selectedOptions: {},
              gitlabRunnerExecutor: cfg.gitlabRunnerExecutor,
            },
            { signal: controller.signal, timeoutMs: targetTimeoutMs },
            {
              onLog: async (event) => {
                await this.appendRunLog(runId, {
                  serverId: server.id,
                  level: event.level,
                  source: event.source,
                  message: event.message,
                });
              },
            },
          );

          succeeded += 1;
          await this.prisma.serverOperationTarget.update({
            where: { id: target.id },
            data: {
              status: ServerOperationTargetStatus.SUCCEEDED,
              finishedAt: new Date(),
              errorMessage: null,
            },
          });
          await this.prisma.auditLog.create({
            data: {
              resourceType: 'SERVER',
              resourceId: server.id,
              userId: run.requestedById ?? null,
              action: 'AUTOMATION_TARGET_SUCCESS',
              metadata: {
                runId,
                actionKey: run.actionKey,
              } as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (controller.signal.aborted) {
            skipped += 1;
            await this.prisma.serverOperationTarget.update({
              where: { id: target.id },
              data: {
                status: ServerOperationTargetStatus.SKIPPED,
                finishedAt: new Date(),
                errorMessage: 'Run canceled by administrator',
              },
            });
            await this.appendRunLog(runId, {
              serverId: server.id,
              level: ServerLogLevel.WARNING,
              source: 'orchestrator',
              message: `Canceled on ${server.name}.`,
            });
            continue;
          }

          const isTimeout = message.startsWith('JOB_TIMEOUT_');
          if (isTimeout) {
            timedOut += 1;
          } else {
            failed += 1;
          }
          await this.prisma.serverOperationTarget.update({
            where: { id: target.id },
            data: {
              status: isTimeout
                ? ServerOperationTargetStatus.TIMEOUT
                : ServerOperationTargetStatus.FAILED,
              finishedAt: new Date(),
              errorMessage: this.redactSecrets(message),
            },
          });
          await this.appendRunLog(runId, {
            serverId: server.id,
            level: ServerLogLevel.ERROR,
            source: 'orchestrator',
            message: this.redactSecrets(message),
          });
          await this.prisma.auditLog.create({
            data: {
              resourceType: 'SERVER',
              resourceId: server.id,
              userId: run.requestedById ?? null,
              action: isTimeout
                ? 'AUTOMATION_TARGET_TIMEOUT'
                : 'AUTOMATION_TARGET_FAILED',
              metadata: {
                runId,
                actionKey: run.actionKey,
                error: this.redactSecrets(message),
              } as Prisma.InputJsonValue,
            },
          });
        }
      }

      const canceled = controller.signal.aborted;
      const finalStatus = canceled
        ? ServerOperationStatus.CANCELED
        : timedOut > 0
          ? succeeded > 0
            ? ServerOperationStatus.PARTIAL
            : ServerOperationStatus.TIMEOUT
          : failed > 0
            ? succeeded > 0
              ? ServerOperationStatus.PARTIAL
              : ServerOperationStatus.FAILED
            : ServerOperationStatus.SUCCEEDED;
      const summary = canceled
        ? 'Automation canceled by administrator.'
        : `Targets: ${String(run.targets.length)} total, ${String(succeeded)} succeeded, ${String(failed)} failed, ${String(timedOut)} timed out, ${String(skipped)} skipped.`;

      await this.prisma.serverOperation.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          summary,
          finishedAt: new Date(),
          ...(finalStatus === ServerOperationStatus.FAILED
            ? { errorMessage: 'One or more targets failed.' }
            : finalStatus === ServerOperationStatus.TIMEOUT
              ? { errorMessage: 'One or more targets timed out.' }
              : { errorMessage: null }),
        },
      });

      this.gateway.emitRunStatus({ runId, status: finalStatus });
      this.gateway.emitRunFinished({
        runId,
        status: finalStatus,
        summary,
      });
    } finally {
      this.controllers.delete(runId);
    }
  }

  private async markTargetSkipped(
    targetId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.serverOperationTarget.update({
      where: { id: targetId },
      data: {
        status: ServerOperationTargetStatus.SKIPPED,
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
  }

  private async appendRunLog(
    runId: string,
    payload: {
      serverId?: string | null;
      level: ServerLogLevel;
      source: string;
      message: string;
    },
  ): Promise<void> {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`automation-log:${runId}`}))`;
      const lastLine = await tx.serverOperationLog.findFirst({
        where: { operationId: runId },
        orderBy: { lineNumber: 'desc' },
        select: { lineNumber: true },
      });
      return await tx.serverOperationLog.create({
        data: {
          operationId: runId,
          serverId: payload.serverId ?? null,
          level: payload.level,
          source: payload.source,
          message: this.redactSecrets(payload.message),
          lineNumber: (lastLine?.lineNumber ?? 0) + 1,
        },
      });
    });

    this.gateway.emitRunLog({
      runId: created.operationId,
      serverId: created.serverId,
      level: created.level,
      source: created.source,
      message: created.message,
      lineNumber: created.lineNumber,
      createdAt: created.createdAt,
    });
  }

  private resolveRunConfig(paramsJson: Prisma.JsonValue): RunConfig {
    const raw =
      paramsJson && typeof paramsJson === 'object'
        ? (paramsJson as Record<string, unknown>)
        : {};

    const rawRoles = Array.isArray(raw.selected_roles)
      ? raw.selected_roles
      : [];
    const roles = rawRoles
      .filter((item): item is string => typeof item === 'string')
      .map((role) => role.trim())
      .filter((role): role is PreparationRoleKey => role.length > 0);

    const gitlabRunnerExecutor =
      typeof raw.gitlabRunnerExecutor === 'string' &&
      raw.gitlabRunnerExecutor.trim().length > 0
        ? raw.gitlabRunnerExecutor.trim()
        : 'docker';

    return {
      roles,
      gitlabRunnerExecutor,
    };
  }

  private resolveTargetTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('AUTOMATION_TARGET_TIMEOUT_MS', '300000'),
    );
    if (Number.isFinite(raw) && raw >= 60_000) {
      return Math.floor(raw);
    }
    return 600_000;
  }

  private redactSecrets(value: string): string {
    return value
      .replace(/(--private-key\s+)\S+/gi, '$1[redacted]')
      .replace(/(registration-token\s+)\S+/gi, '$1[redacted]')
      .replace(/(token=)\S+/gi, '$1[redacted]')
      .replace(/(password=)\S+/gi, '$1[redacted]');
  }
}
