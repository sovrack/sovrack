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

export type CreateUserPayload = {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
};

export type UpdateUserPayload = {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
};
