import { Role } from '@prisma/client';
import { ContainersService } from './containers.service';
import { ContainersController } from './containers.controller';

const mockUser = { id: 'u1', email: 'test@test.com', role: Role.DEVELOPER };

describe('ContainersController', () => {
  function build() {
    const containersService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      inspect: jest.fn().mockResolvedValue({ State: {} }),
      getStats: jest.fn().mockResolvedValue({ cpu: 1 }),
      start: jest.fn().mockResolvedValue({ ok: true }),
      stop: jest.fn().mockResolvedValue({ ok: true }),
      restart: jest.fn().mockResolvedValue({ ok: true }),
      remove: jest.fn().mockResolvedValue({ ok: true }),
      syncFromDocker: jest.fn().mockResolvedValue({ synced: 1 }),
      assertCanAccessContainer: jest.fn().mockResolvedValue(undefined),
      assertCanAccessServerById: jest.fn().mockResolvedValue(undefined),
    } as unknown as ContainersService;
    const ctrl = new ContainersController(containersService);
    return { ctrl, containersService };
  }

  it('read endpoints delegate', async () => {
    const { ctrl, containersService } = build();
    ctrl.findAll({ serverId: 's1' } as never, mockUser as never);
    await ctrl.findOne('c1', mockUser as never);
    await ctrl.inspect('c1', mockUser as never);
    await ctrl.stats('c1', mockUser as never);
    expect(containersService.findAll).toHaveBeenCalledWith(
      { serverId: 's1' },
      'u1',
      Role.DEVELOPER,
    );
    expect(containersService.assertCanAccessContainer).toHaveBeenCalledWith(
      'c1',
      'u1',
      Role.DEVELOPER,
    );
    expect(containersService.findOne).toHaveBeenCalledWith('c1');
    expect(containersService.inspect).toHaveBeenCalledWith('c1');
    expect(containersService.getStats).toHaveBeenCalledWith('c1');
  });

  it('lifecycle endpoints delegate', async () => {
    const { ctrl, containersService } = build();
    await ctrl.start('c1', mockUser as never);
    await ctrl.stop('c1', mockUser as never);
    await ctrl.restart('c1', mockUser as never);
    await ctrl.remove('c1', mockUser as never);
    await ctrl.sync('s1', mockUser as never);
    expect(containersService.assertCanAccessContainer).toHaveBeenCalledWith(
      'c1',
      'u1',
      Role.DEVELOPER,
    );
    expect(containersService.assertCanAccessServerById).toHaveBeenCalledWith(
      's1',
      'u1',
      Role.DEVELOPER,
    );
    expect(containersService.start).toHaveBeenCalledWith('c1');
    expect(containersService.stop).toHaveBeenCalledWith('c1');
    expect(containersService.restart).toHaveBeenCalledWith('c1');
    expect(containersService.remove).toHaveBeenCalledWith('c1');
    expect(containersService.syncFromDocker).toHaveBeenCalledWith('s1');
  });
});
