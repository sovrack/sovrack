import api from "@/shared/lib/api";

export type ComponentStatus = "connected" | "disconnected";

export type PlatformHealth = {
  status: string;
  timestamp: string;
  uptime: number;
  version: string;
  database: ComponentStatus;
  redis: ComponentStatus;
  webhook: {
    autoConfigure: boolean;
    configured: boolean;
    valid: boolean;
    callbackUrl: string | null;
  };
};

export const healthService = {
  async get(): Promise<PlatformHealth> {
    const res = await api.get<PlatformHealth>("/health");
    return res.data;
  },
};
