import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { StaffJwtPayload } from './staff-jwt.strategy';

/**
 * Extrait le payload JWT du staff connecté (back-office).
 * Le staff est ensuite rechargé depuis la DB par les services quand nécessaire.
 */
export const GetStaff = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): StaffJwtPayload => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const request = ctx.switchToHttp().getRequest();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return request.user as StaffJwtPayload;
  },
);
