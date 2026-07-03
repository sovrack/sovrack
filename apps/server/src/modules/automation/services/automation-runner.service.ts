import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Prisma,
  ServerLogLevel,
  ServerRunKind,
  ServerRunStatus,
  ServerRunStepStatus,
} from '@prisma/client';
import { PrismaService } from '../../../shared/database/prisma.service';
import { ServerPreparationAnsibleService } from '../../infrastructure/onboarding/services/server-preparation-ansible.service';
import { ServerRunsService } from '../../infrastructure/server-runs/server-runs.service';
import type { PreparationRoleKey } from '../../infrastructure/servers/shared/server-preparation-options';
import { AutomationGateway } from '../automation.gateway';
import {
  AUTOMATION_RUN_COMPLETED,
  type AutomationRunCompletedEvent,
} from '../shared/automation-events';

type RunConfig = {
  roles: PreparationRoleKey[];
  gitlabRunnerExecutor: string;
};

// AUTOMATION runs persist one ServerRunStep per targeted server (serverId set,
// roleKey null). We load the steps with their server to drive execution.
const runWithStepsInclude = {
  steps: {
    include: { server: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.ServerRunInclude;

type AutomationRunWithSteps = Prisma.ServerRunGetPayload<{
  include: typeof runWithStepsInclude;
}>;

@Injectable()
export class AutomationRunnerService {
  private readonly logger = new Logger(AutomationRunnerService.name);
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ansible: ServerPreparationAnsibleService,
    private readonly gateway: AutomationGateway,
    private readonly configService: ConfigService,
    private readonly events: EventEmitter2,
    private readonly serverRuns: ServerRunsService,
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
    const run: AutomationRunWithSteps | null =
      await this.prisma.serverRun.findFirst({
        where: { id: runId, kind: ServerRunKind.AUTOMATION },
        include: runWithStepsInclude,
      });
    if (!run) {
      return;
    }
    if (run.status === ServerRunStatus.CANCELED) {
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
    const succeededHosts: string[] = [];

    await this.prisma.serverRun.update({
      where: { id: runId },
      data: {
        status: ServerRunStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        errorMessage: null,
      },
    });
    this.gateway.emitRunStatus({
      runId,
      status: ServerRunStatus.RUNNING,
    });

    await this.appendRunLog(runId, {
      level: ServerLogLevel.INFO,
      source: 'orchestrator',
      message:
        'Automation started from control node. Target VPS hosts remain SSH agentless.',
    });

    try {
      for (const step of run.steps) {
        if (controller.signal.aborted) {
          skipped += 1;
          await this.markStepSkipped(step.id, 'Run canceled by administrator');
          continue;
        }

        const server = step.server;
        if (!server) {
          skipped += 1;
          await this.markStepSkipped(step.id, 'Server missing');
          continue;
        }
        if (!server.isActive) {
          skipped += 1;
          await this.markStepSkipped(step.id, 'Server disabled');
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
          await this.markStepSkipped(step.id, 'SSH not validated');
          await this.appendRunLog(runId, {
            serverId: server.id,
            level: ServerLogLevel.WARNING,
            source: 'orchestrator',
            message: `Skipping ${server.name}: SSH is not validated.`,
          });
          continue;
        }

        await this.prisma.serverRunStep.update({
          where: { id: step.id },
          data: {
            status: ServerRunStepStatus.RUNNING,
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
          message: `Running ${run.actionLabel ?? run.actionKey ?? 'automation'} on ${server.name} (${server.host}).`,
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
          succeededHosts.push(server.host);
          await this.prisma.serverRunStep.update({
            where: { id: step.id },
            data: {
              status: ServerRunStepStatus.SUCCEEDED,
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
            await this.prisma.serverRunStep.update({
              where: { id: step.id },
              data: {
                status: ServerRunStepStatus.SKIPPED,
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
          await this.prisma.serverRunStep.update({
            where: { id: step.id },
            data: {
              status: isTimeout
                ? ServerRunStepStatus.TIMEOUT
                : ServerRunStepStatus.FAILED,
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
        ? ServerRunStatus.CANCELED
        : timedOut > 0
          ? succeeded > 0
            ? ServerRunStatus.PARTIAL
            : ServerRunStatus.TIMEOUT
          : failed > 0
            ? succeeded > 0
              ? ServerRunStatus.PARTIAL
              : ServerRunStatus.FAILED
            : ServerRunStatus.SUCCEEDED;
      const summary = canceled
        ? 'Automation canceled by administrator.'
        : `Targets: ${String(run.steps.length)} total, ${String(succeeded)} succeeded, ${String(failed)} failed, ${String(timedOut)} timed out, ${String(skipped)} skipped.`;

      await this.prisma.serverRun.update({
        where: { id: runId },
        data: {
          status: finalStatus,
          summary,
          finishedAt: new Date(),
          ...(finalStatus === ServerRunStatus.FAILED
            ? { errorMessage: 'One or more targets failed.' }
            : finalStatus === ServerRunStatus.TIMEOUT
              ? { errorMessage: 'One or more targets timed out.' }
              : { errorMessage: null }),
        },
      });

      this.events.emit(AUTOMATION_RUN_COMPLETED, {
        runId,
        actionKey: run.actionKey ?? '',
        status: finalStatus,
        succeededHosts,
      } satisfies AutomationRunCompletedEvent);

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

  private async markStepSkipped(
    stepId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.serverRunStep.update({
      where: { id: stepId },
      data: {
        status: ServerRunStepStatus.SKIPPED,
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
    const created = await this.serverRuns.appendLog(runId, {
      serverId: payload.serverId ?? null,
      level: payload.level,
      source: payload.source,
      message: this.redactSecrets(payload.message),
    });

    this.gateway.emitRunLog({
      runId: created.runId,
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
