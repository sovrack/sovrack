import { ServerRunStatus, ServerRunStepStatus } from '@prisma/client';
import {
  runWithStepsInclude,
  toPreparationView,
  type RunWithSteps,
} from './infra-setup-planning.util';

/**
 * Pure transformer coverage: maps a unified ServerRun (kind=PREPARATION) back
 * to the legacy ServerSetup response shape (paramsJson → selectedOptions,
 * resolvedJson → resolvedRoles, retryOfId → retryOfPreparationId, steps → tasks).
 */
describe('infra-setup-planning.util — toPreparationView', () => {
  const baseDate = new Date('2026-01-01T00:00:00.000Z');

  function makeRun(overrides: Partial<RunWithSteps> = {}): RunWithSteps {
    return {
      id: 'run-1',
      serverId: 'srv-1',
      status: ServerRunStatus.SUCCEEDED,
      profile: 'BASIC',
      triggerSource: 'MANUAL',
      requestedById: 'user-1',
      startedAt: baseDate,
      finishedAt: baseDate,
      summary: 'done',
      errorMessage: null,
      retryOfId: null,
      paramsJson: { docker: true },
      resolvedJson: ['DOCKER'],
      createdAt: baseDate,
      updatedAt: baseDate,
      steps: [],
      // Fields present on ServerRun but unused by the transformer.
      kind: 'PREPARATION',
      ...overrides,
    } as unknown as RunWithSteps;
  }

  it('maps top-level run fields onto the legacy view shape', () => {
    const view = toPreparationView(makeRun({ retryOfId: 'prev-run' }));

    expect(view).toMatchObject({
      id: 'run-1',
      serverId: 'srv-1',
      status: ServerRunStatus.SUCCEEDED,
      profile: 'BASIC',
      triggerSource: 'MANUAL',
      requestedById: 'user-1',
      summary: 'done',
      errorMessage: null,
      retryOfPreparationId: 'prev-run',
      selectedOptionsJson: { docker: true },
      resolvedRolesJson: ['DOCKER'],
    });
    expect(view.tasks).toEqual([]);
  });

  it('defaults resolvedRolesJson to an empty array when resolvedJson is null', () => {
    const view = toPreparationView(makeRun({ resolvedJson: null }));
    expect(view.resolvedRolesJson).toEqual([]);
  });

  it('maps each step onto a task view, preserving order', () => {
    const steps = [
      {
        id: 'step-1',
        runId: 'run-1',
        roleKey: 'DOCKER',
        taskName: 'Install Docker',
        orderIndex: 0,
        status: ServerRunStepStatus.OK,
        startedAt: baseDate,
        finishedAt: baseDate,
        message: null,
      },
      {
        id: 'step-2',
        runId: 'run-1',
        roleKey: null,
        taskName: null,
        orderIndex: 1,
        status: ServerRunStepStatus.PENDING,
        startedAt: null,
        finishedAt: null,
        message: 'queued',
      },
    ];
    const view = toPreparationView(
      makeRun({ steps: steps as unknown as RunWithSteps['steps'] }),
    );

    expect(view.tasks).toHaveLength(2);
    expect(view.tasks[0]).toEqual({
      id: 'step-1',
      preparationId: 'run-1',
      roleKey: 'DOCKER',
      taskName: 'Install Docker',
      orderIndex: 0,
      status: ServerRunStepStatus.OK,
      startedAt: baseDate,
      finishedAt: baseDate,
      message: null,
    });
    expect(view.tasks[1]).toMatchObject({
      id: 'step-2',
      roleKey: null,
      status: ServerRunStepStatus.PENDING,
      message: 'queued',
    });
  });

  it('exposes a steps include ordered by orderIndex asc', () => {
    expect(runWithStepsInclude).toEqual({
      steps: { orderBy: { orderIndex: 'asc' } },
    });
  });
});
