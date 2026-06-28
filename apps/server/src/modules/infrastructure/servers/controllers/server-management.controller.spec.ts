import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../../shared/jwt/dto/jwt-payload.dto';
import { ServersCoreService } from '../services';
import { ServerManagementController } from './server-management.controller';

describe('ServerManagementController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const core = {
      create: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      update: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      installPublicKey: jest.fn().mockResolvedValue({ success: true }),
      registerRunner: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      listJobs: jest.fn().mockResolvedValue([]),
      setServerInfraRole: jest.fn().mockResolvedValue({ id: 'srv-1' }),
      listInfraEnvironments: jest.fn().mockResolvedValue([]),
      listEnvironmentsForServer: jest.fn().mockResolvedValue([]),
      pingServer: jest.fn().mockResolvedValue({ ok: true }),
      cancelJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as ServersCoreService;
    const ctrl = new ServerManagementController(core);
    return { ctrl, core };
  }

  it('create / findAll / findOne delegate', async () => {
    const { ctrl, core } = build();
    await ctrl.create({ name: 'x' } as never, user);
    await ctrl.findAll({ page: 1 } as never);
    await ctrl.findOne('srv-1');
    expect(core.create).toHaveBeenCalledWith({ name: 'x' }, 'user-1');
    expect(core.findAll).toHaveBeenCalledWith({ page: 1 });
    expect(core.findOne).toHaveBeenCalledWith('srv-1');
  });

  it('update / patch both delegate to core.update', async () => {
    const { ctrl, core } = build();
    await ctrl.update('srv-1', { name: 'y' } as never, user);
    await ctrl.patch('srv-1', { name: 'z' } as never, user);
    expect(core.update).toHaveBeenNthCalledWith(
      1,
      'srv-1',
      { name: 'y' },
      'user-1',
    );
    expect(core.update).toHaveBeenNthCalledWith(
      2,
      'srv-1',
      { name: 'z' },
      'user-1',
    );
  });

  it('remove returns a success message', async () => {
    const { ctrl, core } = build();
    const res = await ctrl.remove('srv-1', user);
    expect(core.remove).toHaveBeenCalledWith('srv-1', 'user-1');
    expect(res).toEqual({ message: 'Serveur supprimé avec succès' });
  });

  it('installKey / registerRunner pass the dto fields', async () => {
    const { ctrl, core } = build();
    await ctrl.installKey('srv-1', { password: 'pw' } as never, user);
    await ctrl.registerRunner('srv-1', { gitlabUrl: 'u', token: 't' } as never);
    expect(core.installPublicKey).toHaveBeenCalledWith('srv-1', 'pw', 'user-1');
    expect(core.registerRunner).toHaveBeenCalledWith('srv-1', 'u', 't');
  });

  it('jobs / role / environments / ping / cancel delegate', async () => {
    const { ctrl, core } = build();
    await ctrl.listJobs('srv-1', { page: 1 } as never);
    await ctrl.setServerRole(
      'srv-1',
      { infraRole: 'PRODUCTION' } as never,
      user,
    );
    await ctrl.listInfraEnvironments();
    await ctrl.listServerEnvironments('srv-1');
    await ctrl.pingServer('srv-1', user);
    await ctrl.cancelJob('srv-1', 'job-1');
    expect(core.listJobs).toHaveBeenCalledWith('srv-1', { page: 1 });
    expect(core.setServerInfraRole).toHaveBeenCalledWith(
      'srv-1',
      'PRODUCTION',
      'user-1',
    );
    expect(core.listInfraEnvironments).toHaveBeenCalled();
    expect(core.listEnvironmentsForServer).toHaveBeenCalledWith('srv-1');
    expect(core.pingServer).toHaveBeenCalledWith('srv-1', 'user-1');
    expect(core.cancelJob).toHaveBeenCalledWith('srv-1', 'job-1');
  });
});
