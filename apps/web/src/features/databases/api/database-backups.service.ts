import api from "@/shared/lib/api";

export type DatabaseBackup = {
  id: string;
  serviceEnvironmentId: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  trigger: "MANUAL" | "SCHEDULED";
  storagePath: string | null;
  sizeBytes: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export const databaseBackupsService = {
  async list(serviceEnvId: string): Promise<DatabaseBackup[]> {
    const res = await api.get<DatabaseBackup[]>(
      `/service-environments/${serviceEnvId}/backups`,
    );
    return res.data;
  },

  async create(serviceEnvId: string): Promise<DatabaseBackup> {
    const res = await api.post<DatabaseBackup>(
      `/service-environments/${serviceEnvId}/backups`,
    );
    return res.data;
  },

  async restore(
    serviceEnvId: string,
    backupId: string,
  ): Promise<{ ok: true; warnings: string | null }> {
    const res = await api.post<{ ok: true; warnings: string | null }>(
      `/service-environments/${serviceEnvId}/backups/${backupId}/restore`,
    );
    return res.data;
  },
};
