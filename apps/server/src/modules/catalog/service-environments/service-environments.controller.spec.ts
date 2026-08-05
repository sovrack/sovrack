import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { ServiceEnvironmentsService } from './service-environments.service';
import { ServiceEnvironmentsController } from './service-environments.controller';

describe('ServiceEnvironmentsController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const service = {
      link: jest.fn().mockResolvedValue({ id: 'se1' }),
      findOne: jest.fn().mockResolvedValue({ id: 'se1' }),
      update: jest.fn().mockResolvedValue({ id: 'se1' }),
      unlink: jest.fn().mockResolvedValue(undefined),
    } as unknown as ServiceEnvironmentsService;
    const ctrl = new ServiceEnvironmentsController(service);
    return { ctrl, service };
  }

  it('link / findOne / update delegate with scope', async () => {
    const { ctrl, service } = build();
    await ctrl.link('p1', { serviceId: 's1' } as never, user);
    await ctrl.findOne('p1', 'se1', user);
    await ctrl.update('p1', 'se1', { autoDeploy: true } as never, user);
    expect(service.link).toHaveBeenCalledWith(
      'p1',
      { serviceId: 's1' },
      'user-1',
      Role.OWNER,
    );
    expect(service.findOne).toHaveBeenCalledWith(
      'p1',
      'se1',
      'user-1',
      Role.OWNER,
    );
    expect(service.update).toHaveBeenCalledWith(
      'p1',
      'se1',
      { autoDeploy: true },
      'user-1',
      Role.OWNER,
    );
  });

  it('findAll returns a guidance message', async () => {
    const { ctrl } = build();
    const res = ctrl.findAll('p1', user);
    expect(res.message).toContain('environments');
  });

  it('unlink returns a success message', async () => {
    const { ctrl, service } = build();
    const res = await ctrl.unlink('p1', 'se1', user);
    expect(service.unlink).toHaveBeenCalledWith(
      'p1',
      'se1',
      'user-1',
      Role.OWNER,
    );
    expect(res).toEqual({ message: 'Lien supprimé avec succès' });
  });
});
