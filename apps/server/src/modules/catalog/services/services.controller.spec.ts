import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

describe('ServicesController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const servicesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      discoverGroup: jest.fn().mockResolvedValue({ repos: [] }),
      listTemplates: jest.fn().mockReturnValue([]),
      createFromTemplate: jest.fn().mockResolvedValue([{ id: 's1' }]),
      findOne: jest.fn().mockResolvedValue({ id: 's1' }),
      update: jest.fn().mockResolvedValue({ id: 's1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServicesService;
    const ctrl = new ServicesController(servicesService);
    return { ctrl, servicesService };
  }

  it('findAll / create / discoverGroup delegate with project scope', async () => {
    const { ctrl, servicesService } = build();
    await ctrl.findAll('p1', user);
    await ctrl.create('p1', { name: 'x' } as never, user);
    await ctrl.discoverGroup('p1', { groupId: 'g' } as never, user);
    expect(servicesService.findAll).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.ADMIN,
    );
    expect(servicesService.create).toHaveBeenCalledWith(
      'p1',
      { name: 'x' },
      'user-1',
      Role.ADMIN,
    );
    expect(servicesService.discoverGroup).toHaveBeenCalledWith(
      'p1',
      { groupId: 'g' },
      'user-1',
      Role.ADMIN,
    );
  });

  it('listTemplates / createFromTemplate delegate', async () => {
    const { ctrl, servicesService } = build();
    ctrl.listTemplates();
    await ctrl.createFromTemplate('p1', 't1', { name: 'stack' } as never, user);
    expect(servicesService.listTemplates).toHaveBeenCalled();
    expect(servicesService.createFromTemplate).toHaveBeenCalledWith(
      'p1',
      't1',
      'stack',
      'user-1',
      Role.ADMIN,
    );
  });

  it('findOne / update delegate', async () => {
    const { ctrl, servicesService } = build();
    await ctrl.findOne('p1', 's1', user);
    await ctrl.update('p1', 's1', { name: 'y' } as never, user);
    expect(servicesService.findOne).toHaveBeenCalledWith(
      'p1',
      's1',
      'user-1',
      Role.ADMIN,
    );
    expect(servicesService.update).toHaveBeenCalledWith(
      'p1',
      's1',
      { name: 'y' },
      'user-1',
      Role.ADMIN,
    );
  });

  it('remove delegates and returns a success message', async () => {
    const { ctrl, servicesService } = build();
    const res = await ctrl.remove('p1', 's1', user);
    expect(servicesService.remove).toHaveBeenCalledWith(
      'p1',
      's1',
      'user-1',
      Role.ADMIN,
    );
    expect(res).toEqual({ message: 'Service supprimé avec succès' });
  });
});
