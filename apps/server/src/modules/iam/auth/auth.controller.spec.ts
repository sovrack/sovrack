import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import type { JwtPayload } from '../../../shared/jwt/dto/jwt-payload.dto';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ImpersonationSessionService } from './impersonation-session.service';

describe('AuthController', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    role: Role.MEMBER,
    sessionVersion: 7,
  } as JwtPayload;

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
    const impersonationSessions = {
      logout: jest.fn().mockResolvedValue({ message: 'support ended' }),
    } as unknown as ImpersonationSessionService;
    const ctrl = new AuthController(
      authService,
      configService,
      impersonationSessions,
    );
    return { ctrl, authService, impersonationSessions };
  }

  it('login authenticates and sets the auth cookie', async () => {
    const { ctrl, authService } = build();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const result = await ctrl.login({ email: 'a@b.c', password: 'x' }, res);
    expect(authService.login).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
    expect(result).toEqual({ user: { id: 'user-1' } });
  });

  it('getWsToken returns a short-lived websocket token', () => {
    const { ctrl, authService } = build();
    expect(ctrl.getWsToken(user)).toEqual({ wsToken: 'ws-tok' });
    expect(authService.generateWsToken).toHaveBeenCalledWith(
      'user-1',
      'user@example.com',
      7,
    );
  });

  it('getMe delegates to the auth service', async () => {
    const { ctrl, authService } = build();
    await ctrl.getMe(user);
    expect(authService.getMe).toHaveBeenCalledWith('user-1');
  });

  it('décrit une session client normale sans exposer le JWT', () => {
    const { ctrl } = build();
    expect(ctrl.getSession({ ...user, exp: 1_800_000_000 })).toEqual({
      authenticationType: 'user',
      expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
    });
  });

  it("identifie une session d'assistance", () => {
    const { ctrl } = build();
    expect(
      ctrl.getSession({ ...user, authType: 'staff-impersonation' }),
    ).toEqual({
      authenticationType: 'staff-impersonation',
      expiresAt: null,
    });
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

  it('termine une assistance sans révoquer les sessions du client', async () => {
    const { ctrl, authService, impersonationSessions } = build();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    const impersonation = {
      ...user,
      authType: 'staff-impersonation' as const,
      impersonatedByStaffId: 'staff-1',
      impersonationGrantId: 'grant-1',
    };

    const result = await ctrl.logout(impersonation, res);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(impersonationSessions.logout).toHaveBeenCalledWith({
      userId: 'user-1',
      staffId: 'staff-1',
      grantId: 'grant-1',
    });
    expect(result).toEqual({ message: 'support ended' });
  });

  it("ne révoque jamais le client si les métadonnées d'assistance sont invalides", async () => {
    const { ctrl, authService, impersonationSessions } = build();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    await expect(
      ctrl.logout({ ...user, authType: 'staff-impersonation' }, res),
    ).rejects.toThrow(UnauthorizedException);

    expect(res.clearCookie).toHaveBeenCalled();
    expect(authService.logout).not.toHaveBeenCalled();
    expect(impersonationSessions.logout).not.toHaveBeenCalled();
  });
});
