import { VolumesService } from './volumes.service';
import { VolumesController } from './volumes.controller';
import { Role } from '@prisma/client';

const user = { id: 'user-1', email: 'u@example.com', role: Role.MEMBER };

describe('VolumesController', () => {
  function build() {
    const volumesService = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'v1' }),
      create: jest.fn().mockResolvedValue({ id: 'v1' }),
      update: jest.fn().mockResolvedValue({ id: 'v1' }),
      remove: jest.fn().mockResolvedValue({ id: 'v1' }),
    } as unknown as VolumesService;
    const ctrl = new VolumesController(volumesService);
    return { ctrl, volumesService };
  }

  it('findAll forwards filters', async () => {
    const { ctrl, volumesService } = build();
    await ctrl.findAll(user, 's1', 'svc1', 'workspace-1');
    expect(volumesService.findAll).toHaveBeenCalledWith(
      { serverId: 's1', serviceId: 'svc1' },
      'user-1',
      'workspace-1',
    );
  });

  it('CRUD endpoints delegate', async () => {
    const { ctrl, volumesService } = build();
    await ctrl.findOne('v1', user, 'workspace-1');
    await ctrl.create({ name: 'v' } as never, user, 'workspace-1');
    await ctrl.update('v1', { name: 'v2' } as never, user, 'workspace-1');
    await ctrl.remove('v1', user, 'workspace-1');
    expect(volumesService.findOne).toHaveBeenCalledWith(
      'v1',
      'user-1',
      'workspace-1',
    );
    expect(volumesService.create).toHaveBeenCalledWith(
      { name: 'v' },
      'user-1',
      'workspace-1',
    );
    expect(volumesService.update).toHaveBeenCalledWith(
      'v1',
      { name: 'v2' },
      'user-1',
      'workspace-1',
    );
    expect(volumesService.remove).toHaveBeenCalledWith(
      'v1',
      'user-1',
      'workspace-1',
    );
  });
});
