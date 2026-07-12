import { Prisma, ServerRunStatus, ServerRunStepStatus } from '@prisma/client';
import type { SetupReadinessChecks } from './infra-setup.util';
import type { SetupRoleKey } from '../../servers/shared/server-setup';

// ─── Input option types ──────────────────────────────────────────────────────

export type StartSetupOptions = {
  retryOfSetupId?: string;
  triggerSource?: string;
  forcedRoles?: SetupRoleKey[];
};

// ─── Response types ──────────────────────────────────────────────────────────

export type ServerSetupReadiness = {
  serverId: string;
  isReady: boolean;
  checks: SetupReadinessChecks;
  blockingReasons: string[];
  latestValidationAt: Date | null;
};

export type SetupTaskView = {
  id: string;
  setupId: string;
  roleKey: string | null;
  taskName: string | null;
  orderIndex: number;
  status: ServerRunStepStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  message: string | null;
};

export type SetupView = {
  id: string;
  serverId: string | null;
  status: ServerRunStatus;
  profile: string | null;
  triggerSource: string;
  requestedById: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  summary: string | null;
  errorMessage: string | null;
  retryOfSetupId: string | null;
  selectedOptionsJson: Prisma.JsonValue;
  resolvedRolesJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  tasks: SetupTaskView[];
};

// ─── DB includes ─────────────────────────────────────────────────────────────

export const runWithStepsInclude = {
  steps: { orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.ServerRunInclude;

export type RunWithSteps = Prisma.ServerRunGetPayload<{
  include: typeof runWithStepsInclude;
}>;

// ─── View transformer ─────────────────────────────────────────────────────────

export function toSetupView(run: RunWithSteps): SetupView {
  return {
    id: run.id,
    serverId: run.serverId,
    status: run.status,
    profile: run.profile,
    triggerSource: run.triggerSource,
    requestedById: run.requestedById,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    summary: run.summary,
    errorMessage: run.errorMessage,
    retryOfSetupId: run.retryOfId,
    selectedOptionsJson: run.paramsJson,
    resolvedRolesJson: run.resolvedJson ?? [],
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    tasks: run.steps.map((step) => ({
      id: step.id,
      setupId: step.runId,
      roleKey: step.roleKey,
      taskName: step.taskName,
      orderIndex: step.orderIndex,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      message: step.message,
    })),
  };
}
