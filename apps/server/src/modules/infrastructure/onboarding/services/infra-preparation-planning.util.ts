import { Prisma, ServerRunStatus, ServerRunStepStatus } from '@prisma/client';
import type { PreparationReadinessChecks } from './infra-preparation.util';
import type { PreparationRoleKey } from '../../servers/shared/server-preparation-options';

// ─── Input option types ──────────────────────────────────────────────────────

export type StartPreparationOptions = {
  retryOfPreparationId?: string;
  triggerSource?: string;
  forcedRoles?: PreparationRoleKey[];
};

// ─── Response types ──────────────────────────────────────────────────────────

export type ServerPreparationReadiness = {
  serverId: string;
  isReady: boolean;
  checks: PreparationReadinessChecks;
  blockingReasons: string[];
  latestValidationAt: Date | null;
};

export type PreparationTaskView = {
  id: string;
  preparationId: string;
  roleKey: string | null;
  taskName: string | null;
  orderIndex: number;
  status: ServerRunStepStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  message: string | null;
};

export type PreparationView = {
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
  retryOfPreparationId: string | null;
  selectedOptionsJson: Prisma.JsonValue;
  resolvedRolesJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  tasks: PreparationTaskView[];
};

// ─── DB includes ─────────────────────────────────────────────────────────────

export const runWithStepsInclude = {
  steps: { orderBy: { orderIndex: 'asc' } },
} satisfies Prisma.ServerRunInclude;

export type RunWithSteps = Prisma.ServerRunGetPayload<{
  include: typeof runWithStepsInclude;
}>;

// ─── View transformer ─────────────────────────────────────────────────────────

export function toPreparationView(run: RunWithSteps): PreparationView {
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
    retryOfPreparationId: run.retryOfId,
    selectedOptionsJson: run.paramsJson,
    resolvedRolesJson: run.resolvedJson ?? [],
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    tasks: run.steps.map((step) => ({
      id: step.id,
      preparationId: step.runId,
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
