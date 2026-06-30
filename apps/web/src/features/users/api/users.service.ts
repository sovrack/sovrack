import api from "@/shared/lib/api";
import type {
  ChangeMyPasswordPayload,
  CreateUserPayload,
  UpdateUserPayload,
  UserListItem,
} from "@/features/users/types/user";

export const usersService = {
  async getAll(): Promise<UserListItem[]> {
    const res = await api.get<UserListItem[]>("/users");
    return res.data;
  },

  async getById(id: string): Promise<UserListItem> {
    const res = await api.get<UserListItem>(`/users/${id}`);
    return res.data;
  },

  async create(data: CreateUserPayload): Promise<UserListItem> {
    const res = await api.post<UserListItem>("/users", data);
    return res.data;
  },

  async update(id: string, data: UpdateUserPayload): Promise<UserListItem> {
    const res = await api.put<UserListItem>(`/users/${id}`, data);
    return res.data;
  },

  async changeMyPassword(data: ChangeMyPasswordPayload): Promise<UserListItem> {
    const res = await api.put<UserListItem>("/users/me/password", data);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async toggleActive(id: string): Promise<UserListItem> {
    const res = await api.put<UserListItem>(`/users/${id}/toggle-active`);
    return res.data;
  },
};
