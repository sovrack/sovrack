import { Role, type User } from '@prisma/client';

/**
 * Public representation of a customer identity.
 *
 * Prisma's User model also contains password-reset, email-verification and
 * account-deletion material. Returning `Omit<User, 'password'>` therefore
 * still leaked security state. Keep this projection deliberately explicit so
 * newly-added database columns are private by default.
 */
export type SafeUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'fullName'
  | 'role'
  | 'provider'
  | 'isActive'
  | 'emailVerifiedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: Role.MEMBER,
    provider: user.provider,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
