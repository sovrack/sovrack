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
  // C2 : ressources de la machine qui héberge Deploy Automation (disque plein = panne
  // silencieuse n°1). Optionnel : un backend pas encore à jour n'en envoie pas.
  host?: {
    cpuLoad1m: number;
    cpuCount: number;
    memoryTotalMb: number;
    memoryFreeMb: number;
    memoryUsedPercent: number;
    diskTotalGb: number | null;
    diskFreeGb: number | null;
    diskUsedPercent: number | null;
  };
};

export const healthService = {
  async get(): Promise<PlatformHealth> {
    const res = await api.get<PlatformHealth>("/health");
    return res.data;
  },
};
