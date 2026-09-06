import type { Staff } from '@prisma/client';

export type SafeStaff = Pick<
  Staff,
  | 'id'
  | 'email'
  | 'fullName'
  | 'role'
  | 'status'
  | 'mfaEnabled'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
>;

/** Projection explicite : tout nouveau champ interne est privé par défaut. */
export function toSafeStaff(staff: Staff): SafeStaff {
  return {
    id: staff.id,
    email: staff.email,
    fullName: staff.fullName,
    role: staff.role,
    status: staff.status,
    mfaEnabled: staff.mfaEnabled,
    lastLoginAt: staff.lastLoginAt,
    createdAt: staff.createdAt,
    updatedAt: staff.updatedAt,
  };
}
