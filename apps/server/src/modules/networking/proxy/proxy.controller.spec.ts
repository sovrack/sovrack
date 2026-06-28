import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';

describe('ProxyController', () => {
  function build() {
    const proxyService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'r1' }),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      toggleActive: jest.fn().mockResolvedValue({ id: 'r1' }),
      remove: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as unknown as ProxyService;
    const ctrl = new ProxyController(proxyService);
    return { ctrl, proxyService };
  }

  it('findAll forwards filters', () => {
    const { ctrl, proxyService } = build();
    ctrl.findAll('s1', 'se1');
    expect(proxyService.findAll).toHaveBeenCalledWith({
      serverId: 's1',
      serviceEnvId: 'se1',
    });
  });

  it('CRUD + toggle endpoints delegate', () => {
    const { ctrl, proxyService } = build();
    ctrl.findOne('r1');
    ctrl.create({ domain: 'd' } as never);
    ctrl.update('r1', { domain: 'd2' } as never);
    ctrl.toggle('r1');
    ctrl.remove('r1');
    expect(proxyService.findOne).toHaveBeenCalledWith('r1');
    expect(proxyService.create).toHaveBeenCalledWith({ domain: 'd' });
    expect(proxyService.update).toHaveBeenCalledWith('r1', { domain: 'd2' });
    expect(proxyService.toggleActive).toHaveBeenCalledWith('r1');
    expect(proxyService.remove).toHaveBeenCalledWith('r1');
  });
});
