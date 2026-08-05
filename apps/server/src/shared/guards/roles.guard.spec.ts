import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/** Build an ExecutionContext whose request carries the given user. */
function contextWithUser(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWithRequiredRoles(roles: Role[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard (authorization)', () => {
  it('allows access when no role is required on the route', () => {
    const guard = guardWithRequiredRoles(undefined);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('allows access when the required role list is empty', () => {
    const guard = guardWithRequiredRoles([]);
    expect(guard.canActivate(contextWithUser({ role: Role.MEMBER }))).toBe(
      true,
    );
  });

  it('allows access when the user role is in the required set', () => {
    const guard = guardWithRequiredRoles([Role.OWNER]);
    expect(guard.canActivate(contextWithUser({ role: Role.OWNER }))).toBe(true);
  });

  it('denies (403) when the user role is insufficient', () => {
    const guard = guardWithRequiredRoles([Role.OWNER]);
    expect(() =>
      guard.canActivate(contextWithUser({ role: Role.MEMBER })),
    ).toThrow(ForbiddenException);
  });

  it('denies (403) when there is no authenticated user', () => {
    const guard = guardWithRequiredRoles([Role.OWNER]);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
