import api from "@/shared/lib/api";
import type { DashboardStats } from "@/features/dashboard/types/dashboard";

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>("/dashboard/stats");
    return data;
  },
};
