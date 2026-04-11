import api from '@/lib/api';
import type { UserListItem } from '@/types/user';

export const usersService = {
  async getAll(): Promise<UserListItem[]> {
    const res = await api.get<UserListItem[]>('/users');
    return res.data;
  },
};
