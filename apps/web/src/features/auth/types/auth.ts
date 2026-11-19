/** Platform staff roles are deliberately separate from customer identities. */
export type UserRole = "OWNER" | "MEMBER";

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
