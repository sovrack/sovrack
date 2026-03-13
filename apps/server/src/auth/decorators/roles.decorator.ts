import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Décorateur pour définir les rôles autorisés sur une route.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
