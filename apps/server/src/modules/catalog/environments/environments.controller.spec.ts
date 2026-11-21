import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ServiceEnvironmentsService } from '../service-environments/service-environments.service';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsController } from './environments.controller';

describe('EnvironmentsController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const environmentsService = {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'e1' }),
      update: jest.fn().mockResolvedValue({ id: 'e1' }),
      remove: jest.fn().mockResolvedValue(undefined),
      assignServer: jest.fn().mockResolvedValue({ id: 'e1' }),
      removeServer: jest.fn().mockResolvedValue({ id: 'e1' }),
      linkService: jest.fn().mockResolvedValue({ id: 'se1' }),
    } as unknown as EnvironmentsService;
    const serviceEnvsService = {
      findByEnvironment: jest.fn().mockResolvedValue([]),
    } as unknown as ServiceEnvironmentsService;
    const ctrl = new EnvironmentsController(
      environmentsService,
      serviceEnvsService,
    );
    return { ctrl, environmentsService, serviceEnvsService };
  }

  it('CRUD delegates with project scope and acting user', async () => {
    const { ctrl, environmentsService } = build();
    await ctrl.create('p1', { name: 'prod' }, user);
    await ctrl.findAll('p1', user);
    await ctrl.findOne('p1', 'e1', user);
    await ctrl.update('p1', 'e1', { name: 'staging' }, user);
    expect(environmentsService.create).toHaveBeenCalledWith(
      'p1',
      { name: 'prod' },
      'user-1',
      Role.OWNER,
    );
    expect(environmentsService.findAll).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
    );
    expect(environmentsService.findOne).toHaveBeenCalledWith(
      'p1',
      'e1',
      'user-1',
      Role.OWNER,
    );
    expect(environmentsService.update).toHaveBeenCalledWith(
      'p1',
      'e1',
      { name: 'staging' },
      'user-1',
      Role.OWNER,
    );
  });

  it('remove returns a success message', async () => {
    const { ctrl, environmentsService } = build();
    const res = await ctrl.remove('p1', 'e1', user);
    expect(environmentsService.remove).toHaveBeenCalledWith(
      'p1',
      'e1',
      'user-1',
      Role.OWNER,
    );
    expect(res).toEqual({ message: 'Environnement supprimé avec succès' });
  });

  it('server + service association endpoints delegate', async () => {
    const { ctrl, environmentsService, serviceEnvsService } = build();
    await ctrl.assignServer('p1', 'e1', 'srv-1', user);
    await ctrl.removeServer('p1', 'e1', 'srv-1', user);
    await ctrl.linkService('p1', 'e1', 's1', user);
    await ctrl.listLinkedServices('p1', 'e1', user);
    expect(environmentsService.assignServer).toHaveBeenCalledWith(
      'p1',
      'e1',
      'srv-1',
      'user-1',
      Role.OWNER,
    );
    expect(environmentsService.removeServer).toHaveBeenCalledWith(
      'p1',
      'e1',
      'srv-1',
      'user-1',
      Role.OWNER,
    );
    expect(environmentsService.linkService).toHaveBeenCalledWith(
      'p1',
      'e1',
      's1',
      'user-1',
      Role.OWNER,
    );
    expect(serviceEnvsService.findByEnvironment).toHaveBeenCalledWith(
      'p1',
      'e1',
      'user-1',
      Role.OWNER,
    );
  });
});
