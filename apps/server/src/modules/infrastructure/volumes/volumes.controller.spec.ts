import { VolumesService } from './volumes.service';
import { VolumesController } from './volumes.controller';

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

  it('findAll forwards filters', () => {
    const { ctrl, volumesService } = build();
    ctrl.findAll('s1', 'svc1');
    expect(volumesService.findAll).toHaveBeenCalledWith({
      serverId: 's1',
      serviceId: 'svc1',
    });
  });

  it('CRUD endpoints delegate', () => {
    const { ctrl, volumesService } = build();
    ctrl.findOne('v1');
    ctrl.create({ name: 'v' } as never);
    ctrl.update('v1', { name: 'v2' } as never);
    ctrl.remove('v1');
    expect(volumesService.findOne).toHaveBeenCalledWith('v1');
    expect(volumesService.create).toHaveBeenCalledWith({ name: 'v' });
    expect(volumesService.update).toHaveBeenCalledWith('v1', { name: 'v2' });
    expect(volumesService.remove).toHaveBeenCalledWith('v1');
  });
});
