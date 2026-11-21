import { ServersCoreService } from './servers-core.service';

// ServersCoreService is now a pure facade (CRUD logic extracted into
// ServersCrudService — see servers-crud.service.spec.ts for that coverage
// and EXPLORATION_BACKEND_DEPENDANCES.md section 1 for the rationale). This
// spec only verifies each public method delegates to the right sub-service
// with the right arguments — the facade contract the 4 controllers rely on.
describe('ServersCoreService (facade)', () => {
  const workspaceId = 'workspace-1';
  let crud: {
    create: jest.Mock;
    findAll: jest.Mock;
    pingAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let jobsFacade: Record<string, jest.Mock>;
  let readersFacade: Record<string, jest.Mock>;
  let service: ServersCoreService;

  beforeEach(() => {
    crud = {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      findAll: jest.fn().mockResolvedValue([]),
      pingAll: jest.fn().mockResolvedValue({ s1: true }),
      findOne: jest.fn().mockResolvedValue({ id: 's1' }),
      update: jest.fn().mockResolvedValue({ id: 's1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    jobsFacade = {
      listJobs: jest.fn().mockResolvedValue([]),
      cancelJob: jest.fn().mockResolvedValue(undefined),
      verifyServer: jest.fn().mockResolvedValue({ id: 's1' }),
      detectServer: jest.fn().mockResolvedValue({ id: 's1' }),
      registerRunner: jest.fn().mockResolvedValue({ id: 's1' }),
      installPublicKey: jest.fn().mockResolvedValue({ success: true }),
      pingServer: jest.fn().mockResolvedValue({ ok: true }),
      toErrorMessage: jest.fn().mockReturnValue('err'),
    };
    readersFacade = {
      listAuditEvents: jest.fn().mockResolvedValue([]),
      listCapabilities: jest.fn().mockResolvedValue([]),
      listInstalledTools: jest.fn().mockResolvedValue([]),
      listValidationResults: jest.fn().mockResolvedValue([]),
      getRecentVerificationLogs: jest.fn().mockResolvedValue([]),
      setServerInfraRole: jest.fn().mockResolvedValue({ id: 's1' }),
      listInfraEnvironments: jest.fn().mockResolvedValue([]),
      listEnvironmentsForServer: jest.fn().mockResolvedValue([]),
    };

    service = new ServersCoreService(
      crud as never,
      jobsFacade as never,
      readersFacade as never,
    );
  });

  it('delegates CRUD methods to ServersCrudService', async () => {
    await service.create({ name: 'srv' } as never, 'admin', workspaceId);
    expect(crud.create).toHaveBeenCalledWith(
      { name: 'srv' },
      'admin',
      workspaceId,
    );

    await service.findAll(undefined, 'admin', workspaceId);
    expect(crud.findAll).toHaveBeenCalledWith(undefined, 'admin', workspaceId);

    await service.findOne('s1', 'admin', workspaceId);
    expect(crud.findOne).toHaveBeenCalledWith('s1', 'admin', workspaceId);

    await service.update('s1', { name: 'x' }, 'admin', workspaceId);
    expect(crud.update).toHaveBeenCalledWith(
      's1',
      { name: 'x' },
      'admin',
      workspaceId,
    );

    await service.remove('s1', 'admin', workspaceId);
    expect(crud.remove).toHaveBeenCalledWith('s1', 'admin', workspaceId);

    await service.pingAll('admin', workspaceId);
    expect(crud.pingAll).toHaveBeenCalledWith('admin', workspaceId);
  });

  it('delegates jobs/verification/preparation/detection methods to ServersJobsFacade', async () => {
    await service.listJobs('s1');
    expect(jobsFacade.listJobs).toHaveBeenCalledWith('s1', undefined);

    await service.cancelJob('s1', 'j1');
    expect(jobsFacade.cancelJob).toHaveBeenCalledWith('s1', 'j1');

    await service.verifyServer('s1', 'admin');
    expect(jobsFacade.verifyServer).toHaveBeenCalledWith('s1', 'admin');

    await service.detectServer('s1');
    expect(jobsFacade.detectServer).toHaveBeenCalledWith('s1', undefined);

    await service.registerRunner('s1', 'https://gitlab.example.com', 'tok');
    expect(jobsFacade.registerRunner).toHaveBeenCalledWith(
      's1',
      'https://gitlab.example.com',
      'tok',
    );

    await service.installPublicKey('s1', 'pw');
    expect(jobsFacade.installPublicKey).toHaveBeenCalledWith(
      's1',
      'pw',
      undefined,
    );

    await service.pingServer('s1', 'admin');
    expect(jobsFacade.pingServer).toHaveBeenCalledWith('s1', 'admin');

    service.toErrorMessage(new Error('boom'));
    expect(jobsFacade.toErrorMessage).toHaveBeenCalled();
  });

  it('delegates audit/capabilities/preparation-history/infra-role methods to ServersReadersFacade', async () => {
    await service.listAuditEvents('s1');
    expect(readersFacade.listAuditEvents).toHaveBeenCalledWith('s1');

    await service.listCapabilities('s1');
    expect(readersFacade.listCapabilities).toHaveBeenCalledWith('s1');

    await service.listInstalledTools('s1');
    expect(readersFacade.listInstalledTools).toHaveBeenCalledWith('s1');

    await service.listValidationResults('s1');
    expect(readersFacade.listValidationResults).toHaveBeenCalledWith('s1');

    await service.getRecentVerificationLogs('s1', 5);
    expect(readersFacade.getRecentVerificationLogs).toHaveBeenCalledWith(
      's1',
      5,
    );

    await service.setServerInfraRole('s1', 'PRODUCTION', 'admin');
    expect(readersFacade.setServerInfraRole).toHaveBeenCalledWith(
      's1',
      'PRODUCTION',
      'admin',
    );

    await service.listInfraEnvironments(workspaceId);
    expect(readersFacade.listInfraEnvironments).toHaveBeenCalledWith(
      workspaceId,
    );

    await service.listEnvironmentsForServer('s1');
    expect(readersFacade.listEnvironmentsForServer).toHaveBeenCalledWith('s1');
  });
});
