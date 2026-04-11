import type { UserRole } from '@/types/auth';

export type UserListItem = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
