import { Role } from '@prisma/client';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const usersService = {
      changeMyPassword: jest.fn().mockResolvedValue({ id: 'user-1' }),
    } as unknown as UsersService;
    const ctrl = new UsersController(usersService);
    return { ctrl, usersService };
  }

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
});
