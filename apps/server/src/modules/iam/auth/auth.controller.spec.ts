import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const user = { id: 'user-1', role: Role.OWNER } as JwtPayload;

  function build() {
    const authService = {
      login: jest
        .fn()
        .mockResolvedValue({ access_token: 'tok', user: { id: 'user-1' } }),
      generateWsToken: jest.fn().mockReturnValue('ws-tok'),
      getMe: jest.fn().mockResolvedValue({ id: 'user-1' }),
      logout: jest.fn().mockResolvedValue({ message: 'bye' }),
    } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('token'),
    } as unknown as ConfigService;
    const ctrl = new AuthController(authService, configService);
    return { ctrl, authService };
  }

  it('login authenticates and sets the auth cookie', async () => {
    const { ctrl, authService } = build();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const result = await ctrl.login(
      { email: 'a@b.c', password: 'x' } as never,
      res,
    );
    expect(authService.login).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
    expect(result.access_token).toBe('tok');
  });

  it('getWsToken returns a short-lived websocket token', () => {
    const { ctrl, authService } = build();
    expect(ctrl.getWsToken(user)).toEqual({ wsToken: 'ws-tok' });
    expect(authService.generateWsToken).toHaveBeenCalledWith(
      'user-1',
      Role.OWNER,
    );
  });

  it('getMe delegates to the auth service', async () => {
    const { ctrl, authService } = build();
    await ctrl.getMe(user);
    expect(authService.getMe).toHaveBeenCalledWith('user-1');
  });

  it('logout clears the cookie and records the event', async () => {
    const { ctrl, authService } = build();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const result = await ctrl.logout(user, res);
    expect(res.clearCookie).toHaveBeenCalled();
    expect(authService.logout).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ message: 'bye' });
  });
});
