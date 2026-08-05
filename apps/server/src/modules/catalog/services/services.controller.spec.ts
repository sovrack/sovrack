import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ServicesService } from './services.service';
import { ServicesCredentialsService } from './services-credentials.service';
import { ServiceTemplatesFactoryService } from './service-templates-factory.service';
import { ServicesController } from './services.controller';

describe('ServicesController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const servicesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      discoverGroup: jest.fn().mockResolvedValue({ repos: [] }),
      findOne: jest.fn().mockResolvedValue({ id: 's1' }),
      update: jest.fn().mockResolvedValue({ id: 's1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServicesService;
    const credentialsService = {
      getCredentials: jest.fn().mockResolvedValue({ serviceId: 's1' }),
    } as unknown as ServicesCredentialsService;
    const templatesFactory = {
      listTemplates: jest.fn().mockReturnValue([]),
      createFromTemplate: jest.fn().mockResolvedValue([{ id: 's1' }]),
    } as unknown as ServiceTemplatesFactoryService;
    const ctrl = new ServicesController(
      servicesService,
      credentialsService,
      templatesFactory,
    );
    return { ctrl, servicesService, credentialsService, templatesFactory };
  }

  it('findAll / create / discoverGroup delegate with project scope', async () => {
    const { ctrl, servicesService } = build();
    await ctrl.findAll('p1', user);
    await ctrl.create('p1', { name: 'x' } as never, user);
    await ctrl.discoverGroup('p1', { groupId: 'g' } as never, user);
    expect(servicesService.findAll).toHaveBeenCalledWith(
      'p1',
      'user-1',
      Role.OWNER,
    );
    expect(servicesService.create).toHaveBeenCalledWith(
      'p1',
      { name: 'x' },
      'user-1',
      Role.OWNER,
    );
    expect(servicesService.discoverGroup).toHaveBeenCalledWith(
      'p1',
      { groupId: 'g' },
      'user-1',
      Role.OWNER,
    );
  });

  it('listTemplates / createFromTemplate delegate to ServiceTemplatesFactoryService', async () => {
    const { ctrl, templatesFactory } = build();
    ctrl.listTemplates();
    await ctrl.createFromTemplate('p1', 't1', { name: 'stack' } as never, user);
    expect(templatesFactory.listTemplates).toHaveBeenCalled();
    expect(templatesFactory.createFromTemplate).toHaveBeenCalledWith(
      'p1',
      't1',
      'stack',
      'user-1',
      Role.OWNER,
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
      Role.OWNER,
    );
    expect(servicesService.update).toHaveBeenCalledWith(
      'p1',
      's1',
      { name: 'y' },
      'user-1',
      Role.OWNER,
    );
  });

  it('getCredentials delegates to the dedicated credentials service with project scope', async () => {
    const { ctrl, credentialsService } = build();
    await ctrl.getCredentials('p1', 's1', user);
    expect(credentialsService.getCredentials).toHaveBeenCalledWith(
      'p1',
      's1',
      'user-1',
      Role.OWNER,
    );
  });

  it('remove delegates and returns a success message', async () => {
    const { ctrl, servicesService } = build();
    const res = await ctrl.remove('p1', 's1', user);
    expect(servicesService.remove).toHaveBeenCalledWith(
      'p1',
      's1',
      'user-1',
      Role.OWNER,
    );
    expect(res).toEqual({ message: 'Service supprimé avec succès' });
  });
});
