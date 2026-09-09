import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ImpersonationReadonlyGuard } from './impersonation-readonly.guard';

function context(
  method: string,
  authType?: 'user' | 'staff-impersonation',
  type: 'http' | 'ws' = 'http',
): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ method, user: { authType } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ImpersonationReadonlyGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new ImpersonationReadonlyGuard(reflector);

  beforeEach(() => jest.clearAllMocks());

  it('ne limite pas une session client normale', () => {
    expect(guard.canActivate(context('DELETE', 'user'))).toBe(true);
  });

  it('autorise la lecture pendant une assistance', () => {
    expect(guard.canActivate(context('GET', 'staff-impersonation'))).toBe(true);
  });

  it('refuse une mutation pendant une assistance', () => {
    expect(() =>
      guard.canActivate(context('POST', 'staff-impersonation')),
    ).toThrow(ForbiddenException);
  });

  it('autorise uniquement une mutation explicitement annotée', () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    expect(guard.canActivate(context('POST', 'staff-impersonation'))).toBe(
      true,
    );
  });

  it('peut interdire explicitement une route GET sensible', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(true);
    expect(() =>
      guard.canActivate(context('GET', 'staff-impersonation')),
    ).toThrow(ForbiddenException);
  });

  it('ignore les contextes websocket', () => {
    expect(
      guard.canActivate(context('POST', 'staff-impersonation', 'ws')),
    ).toBe(true);
  });
});
