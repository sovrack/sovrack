export type UserRole = "ADMIN" | "DEVELOPER";

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
  access_token: string;
  user: AuthUser;
};
