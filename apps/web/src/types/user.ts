import type { components } from '@/generated/api-contract';
import type { UserRole } from '@/types/auth';

type ApiSchema = components['schemas'];

export type UserListItem = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserPayload = Omit<ApiSchema['CreateUserDto'], 'role'> & {
  role: UserRole;
};

export type UpdateUserPayload = ApiSchema['UpdateUserDto'];

export type ChangeMyPasswordPayload = ApiSchema['ChangeMyPasswordDto'];
