import api from "@/shared/lib/api";
import type { UserRole } from "@/features/auth";
import type {
  PlatformRole,
  StaffStatus,
  StaffUser,
} from "@/features/staff/types/staff";

export type StaffOverview = {
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

export type StaffUserView = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffTeam = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { members: number; projects: number; servers: number };
};

export type StaffSubscription = {
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

export const staffService = {
  getOverview: async (): Promise<StaffOverview> => {
    const res = await api.get<StaffOverview>("/staff/overview");
    return res.data;
  },
  getUsers: async (page = 1, limit = 50): Promise<Paginated<StaffUserView>> => {
    const res = await api.get<Paginated<StaffUserView>>(
      `/staff/users?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
  getTeams: async (page = 1, limit = 50): Promise<Paginated<StaffTeam>> => {
    const res = await api.get<Paginated<StaffTeam>>(
      `/staff/teams?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
  getSubscriptions: async (): Promise<StaffSubscription[]> => {
    const res = await api.get<StaffSubscription[]>("/staff/subscriptions");
    return res.data;
  },

  updateUser: async (
    id: string,
    body: { role?: UserRole; isActive?: boolean },
  ) => {
    const res = await api.patch(`/staff/users/${id}`, body);
    return res.data;
  },

  deleteUser: async (id: string) => {
    const res = await api.delete(`/staff/users/${id}`);
    return res.data;
  },

  impersonateUser: async (
    id: string,
  ): Promise<{ access_token: string; user: AuthUserView }> => {
    const res = await api.post(`/staff/users/${id}/impersonate`);
    return res.data;
  },

  listStaff: async (page = 1, limit = 50): Promise<Paginated<StaffUser>> => {
    const res = await api.get<Paginated<StaffUser>>(
      `/staff/staff?page=${page}&limit=${limit}`,
    );
    return res.data;
  },

  createStaff: async (body: {
    email: string;
    password: string;
    fullName: string;
    role?: PlatformRole;
  }): Promise<StaffUser> => {
    const res = await api.post<StaffUser>("/staff/staff", body);
    return res.data;
  },

  updateStaff: async (
    id: string,
    body: {
      role?: PlatformRole;
      status?: StaffStatus;
      fullName?: string;
      password?: string;
    },
  ): Promise<StaffUser> => {
    const res = await api.patch<StaffUser>(`/staff/staff/${id}`, body);
    return res.data;
  },

  getAuditLogs: async (
    page = 1,
    limit = 50,
  ): Promise<Paginated<AuditLogEntry>> => {
    const res = await api.get<Paginated<AuditLogEntry>>(
      `/staff/audit-logs?page=${page}&limit=${limit}`,
    );
    return res.data;
  },
};

export type AuthUserView = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
};

export type AuditLogEntry = {
  id: string;
  staffId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  ip: string | null;
  createdAt: string;
  staff?: { id: string; email: string; fullName: string } | null;
};
