import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const user = { id: 'user-1', role: Role.ADMIN } as JwtPayload;

  function build() {
    const usersService = {
      create: jest.fn().mockResolvedValue({ id: 'u1' }),
      findAll: jest.fn().mockResolvedValue([]),
      changeMyPassword: jest.fn().mockResolvedValue({ id: 'user-1' }),
      findByIdOrFail: jest.fn().mockResolvedValue({ id: 'u1' }),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
      delete: jest.fn().mockResolvedValue({ id: 'u1' }),
      toggleActive: jest.fn().mockResolvedValue({ id: 'u1' }),
    } as unknown as UsersService;
    const ctrl = new UsersController(usersService);
    return { ctrl, usersService };
  }

  it('create / findAll delegate', async () => {
    const { ctrl, usersService } = build();
    await ctrl.create({ email: 'a@b.c' } as never);
    await ctrl.findAll({ page: 1 } as never);
    expect(usersService.create).toHaveBeenCalledWith({ email: 'a@b.c' });
    expect(usersService.findAll).toHaveBeenCalledWith({ page: 1 });
  });

  it('changeMyPassword delegates with the current user id', async () => {
    const { ctrl, usersService } = build();
    await ctrl.changeMyPassword(user, {
      oldPassword: 'a',
      newPassword: 'b',
    } as never);
    expect(usersService.changeMyPassword).toHaveBeenCalledWith('user-1', {
      oldPassword: 'a',
      newPassword: 'b',
    });
  });

  it('findById / delete / toggleActive delegate', async () => {
    const { ctrl, usersService } = build();
    await ctrl.findById('u1');
    await ctrl.delete('u1');
    await ctrl.toggleActive('u1');
    expect(usersService.findByIdOrFail).toHaveBeenCalledWith('u1');
    expect(usersService.delete).toHaveBeenCalledWith('u1');
    expect(usersService.toggleActive).toHaveBeenCalledWith('u1');
  });

  it('update passes the acting user identity', async () => {
    const { ctrl, usersService } = build();
    await ctrl.update('u1', user, { fullName: 'X' } as never);
    expect(usersService.update).toHaveBeenCalledWith(
      'u1',
      { fullName: 'X' },
      { id: 'user-1', role: Role.ADMIN },
    );
  });
});
