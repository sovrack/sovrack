import { Role } from '@prisma/client';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';

const mockUser = { id: 'u1', email: 'test@test.com', role: Role.MEMBER };

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

  it('findAll forwards filters', async () => {
    const { ctrl, proxyService } = build();
    await ctrl.findAll('s1', 'se1', mockUser as never, 'workspace-1');
    expect(proxyService.findAll).toHaveBeenCalledWith(
      { serverId: 's1', serviceEnvId: 'se1' },
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
  });

  it('CRUD + toggle endpoints delegate', async () => {
    const { ctrl, proxyService } = build();
    await ctrl.findOne('r1', mockUser as never, 'workspace-1');
    await ctrl.create(
      { domain: 'd' } as never,
      mockUser as never,
      'workspace-1',
    );
    await ctrl.update(
      'r1',
      { domain: 'd2' } as never,
      mockUser as never,
      'workspace-1',
    );
    await ctrl.toggle('r1', mockUser as never, 'workspace-1');
    await ctrl.remove('r1', mockUser as never, 'workspace-1');
    expect(proxyService.findOne).toHaveBeenCalledWith(
      'r1',
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
    expect(proxyService.create).toHaveBeenCalledWith(
      { domain: 'd' },
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
    expect(proxyService.update).toHaveBeenCalledWith(
      'r1',
      { domain: 'd2' },
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
    expect(proxyService.toggleActive).toHaveBeenCalledWith(
      'r1',
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
    expect(proxyService.remove).toHaveBeenCalledWith(
      'r1',
      'u1',
      Role.MEMBER,
      'workspace-1',
    );
  });
});
