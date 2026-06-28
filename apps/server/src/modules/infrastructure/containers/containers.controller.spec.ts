import { ContainersService } from './containers.service';
import { DockerApiService } from '../../../adapters/container-runtime/docker-api.service';
import { ContainersController } from './containers.controller';

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
    } as unknown as ContainersService;
    const docker = {} as unknown as DockerApiService;
    const ctrl = new ContainersController(containersService, docker);
    return { ctrl, containersService };
  }

  it('read endpoints delegate', () => {
    const { ctrl, containersService } = build();
    ctrl.findAll({ serverId: 's1' } as never);
    ctrl.findOne('c1');
    ctrl.inspect('c1');
    ctrl.stats('c1');
    expect(containersService.findAll).toHaveBeenCalledWith({ serverId: 's1' });
    expect(containersService.findOne).toHaveBeenCalledWith('c1');
    expect(containersService.inspect).toHaveBeenCalledWith('c1');
    expect(containersService.getStats).toHaveBeenCalledWith('c1');
  });

  it('lifecycle endpoints delegate', () => {
    const { ctrl, containersService } = build();
    ctrl.start('c1');
    ctrl.stop('c1');
    ctrl.restart('c1');
    ctrl.remove('c1');
    ctrl.sync('s1');
    expect(containersService.start).toHaveBeenCalledWith('c1');
    expect(containersService.stop).toHaveBeenCalledWith('c1');
    expect(containersService.restart).toHaveBeenCalledWith('c1');
    expect(containersService.remove).toHaveBeenCalledWith('c1');
    expect(containersService.syncFromDocker).toHaveBeenCalledWith('s1');
  });
});
