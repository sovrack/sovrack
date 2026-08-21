import type { JwtPayload } from '../../shared/jwt/dto/jwt-payload.dto';
import { DeploymentsValidationService } from './query/deployments-validation.service';
import { DeploymentsCreateService } from './core/deployments-create.service';
import { DeploymentsQueryService } from './query/deployments-query.service';
import { DeploymentsLifecycleService } from './core/deployments-lifecycle.service';
import { DeploymentsRollbackService } from './core/deployments-rollback.service';
import { DeploymentContainerInspectorService } from './query/deployment-container-inspector.service';
import { DeploymentsLogSearchService } from './query/deployments-log-search.service';
import { DeploymentsController } from './deployments.controller';

describe('DeploymentsController', () => {
  const user = { id: 'user-1', role: 'OWNER' } as JwtPayload;
  const workspaceId = 'workspace-1';

  function build() {
    const createService = {
      create: jest.fn().mockResolvedValue({ id: 'd1' }),
    } as unknown as DeploymentsCreateService;
    const queryService = {
      findAll: jest.fn().mockResolvedValue([]),
      findByProject: jest.fn().mockResolvedValue([]),
      previewEnv: jest.fn().mockResolvedValue({ entries: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 'd1' }),
    } as unknown as DeploymentsQueryService;
    const lifecycleService = {
      cancel: jest.fn().mockResolvedValue({ id: 'd1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as DeploymentsLifecycleService;
    const rollbackService = {
      rollback: jest.fn().mockResolvedValue({ id: 'd2' }),
    } as unknown as DeploymentsRollbackService;
    const containerInspector = {
      getContainerLogs: jest.fn().mockResolvedValue('logs'),
    } as unknown as DeploymentContainerInspectorService;
    const validationService = {
      validate: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as DeploymentsValidationService;
    const logSearchService = {
      searchLogs: jest.fn().mockResolvedValue({ lines: [], total: 0 }),
    } as unknown as DeploymentsLogSearchService;
    const ctrl = new DeploymentsController(
      createService,
      queryService,
      lifecycleService,
      rollbackService,
      containerInspector,
      validationService,
      logSearchService,
    );
    return {
      ctrl,
      createService,
      queryService,
      lifecycleService,
      rollbackService,
      containerInspector,
      validationService,
      logSearchService,
    };
  }

  it('validate delegates with the resolved build source default', async () => {
    const { ctrl, validationService } = build();
    await ctrl.validate(
      { projectId: 'p1', environmentId: 'e1', serviceEnvId: 'se1' } as never,
      user,
      workspaceId,
    );
    expect(validationService.validate).toHaveBeenCalledWith(
      'p1',
      'e1',
      'DOCKERFILE_LOCAL',
      'user-1',
      'se1',
      workspaceId,
    );
  });

  it('create delegates to the create service', async () => {
    const { ctrl, createService } = build();
    await ctrl.create({ projectId: 'p1' } as never, user, workspaceId);
    expect(createService.create).toHaveBeenCalledWith(
      { projectId: 'p1' },
      'user-1',
      workspaceId,
    );
  });

  it('findAll / findByProject / previewEnv / findOne delegate to the query service', async () => {
    const { ctrl, queryService } = build();
    await ctrl.findAll(user, { page: 1 } as never, workspaceId);
    await ctrl.findByProject('p1', user, workspaceId);
    await ctrl.previewEnv('se1', user, workspaceId);
    await ctrl.findOne('d1', user, workspaceId);
    expect(queryService.findAll).toHaveBeenCalledWith(
      'user-1',
      'OWNER',
      { page: 1 },
      workspaceId,
    );
    expect(queryService.findByProject).toHaveBeenCalledWith(
      'p1',
      'user-1',
      'OWNER',
      workspaceId,
    );
    expect(queryService.previewEnv).toHaveBeenCalledWith(
      'se1',
      'user-1',
      'OWNER',
      workspaceId,
    );
    expect(queryService.findOne).toHaveBeenCalledWith(
      'd1',
      'user-1',
      'OWNER',
      workspaceId,
    );
  });

  it('cancel / rollback / remove delegate to the lifecycle & rollback services', async () => {
    const { ctrl, lifecycleService, rollbackService } = build();
    await ctrl.cancel('d1', user, workspaceId);
    await ctrl.rollback('d1', user, undefined, workspaceId);
    await ctrl.remove('d1', user, workspaceId);
    expect(lifecycleService.cancel).toHaveBeenCalledWith(
      'd1',
      'user-1',
      'OWNER',
      workspaceId,
    );
    expect(rollbackService.rollback).toHaveBeenCalledWith(
      'd1',
      'user-1',
      'OWNER',
      undefined,
      workspaceId,
    );
    expect(lifecycleService.remove).toHaveBeenCalledWith(
      'd1',
      'user-1',
      'OWNER',
      workspaceId,
    );
  });

  it('containerLogs parses the tail query (default 300)', async () => {
    const { ctrl, containerInspector } = build();
    await ctrl.containerLogs('d1', '50', user, workspaceId);
    expect(containerInspector.getContainerLogs).toHaveBeenCalledWith('d1', 50);
    await ctrl.containerLogs('d1', undefined, user, workspaceId);
    expect(containerInspector.getContainerLogs).toHaveBeenCalledWith('d1', 300);
  });

  it('searchLogs delegates with defaults for q and level', async () => {
    const { ctrl, logSearchService } = build();
    await ctrl.searchLogs('d1', user, undefined, undefined, workspaceId);
    expect(logSearchService.searchLogs).toHaveBeenCalledWith(
      'd1',
      'user-1',
      'OWNER',
      '',
      'ALL',
      workspaceId,
    );
  });
});
