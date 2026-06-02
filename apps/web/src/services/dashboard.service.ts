import api from '@/lib/api';
import type { DashboardStats } from '@/types/dashboard';

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const { data } = await api.get<DashboardStats>('/dashboard/stats');
    return data;
  },
};
