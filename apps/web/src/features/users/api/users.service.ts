import api from "@/shared/lib/api";
import type { AuthUser } from "@/features/auth";
import type { ChangeMyPasswordPayload } from "@/features/users/types/user";

export const usersService = {
  async changeMyPassword(data: ChangeMyPasswordPayload): Promise<AuthUser> {
    const res = await api.put<AuthUser>("/users/me/password", data);
    return res.data;
  },
};
