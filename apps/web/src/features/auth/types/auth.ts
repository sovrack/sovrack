export type UserRole = "SUPER_ADMIN" | "OWNER" | "MEMBER";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LoginResponse = {
  user: AuthUser;
};
