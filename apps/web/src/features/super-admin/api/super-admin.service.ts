import api from "@/shared/lib/api";
import type { UserRole } from "@/features/auth/types/auth";

export type SuperAdminOverview = {
  users: {
    total: number;
    active: number;
    admins: number;
    developers: number;
  };
  teams: {
    total: number;
  };
  subscriptions: {
    total: number;
    active: number;
    trialing: number;
    canceled: number;
  };
  recentUsers: Array<{
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
    createdAt: string;
  }>;
};

export type SuperAdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminTeam = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { members: number; projects: number; servers: number };
};

export type SuperAdminSubscription = {
  id: string;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  team: { id: string; name: string };
};

type Paginated<T> = {
  total: number;
  page: number;
  limit: number;
  items: T[];
};

export const superAdminService = {
  getOverview: async (): Promise<SuperAdminOverview> => {
    const res = await api.get<SuperAdminOverview>("/super-admin/overview");
    return res.data;
  },
  getUsers: async (page = 1, limit = 50): Promise<Paginated<SuperAdminUser>> => {
    const res = await api.get<Paginated<SuperAdminUser>>(
      `/super-admin/users?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
  getTeams: async (page = 1, limit = 50): Promise<Paginated<SuperAdminTeam>> => {
    const res = await api.get<Paginated<SuperAdminTeam>>(
      `/super-admin/teams?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
  getSubscriptions: async (): Promise<SuperAdminSubscription[]> => {
    const res = await api.get<SuperAdminSubscription[]>(
      "/super-admin/subscriptions",
    );
    return res.data;
  },
};
