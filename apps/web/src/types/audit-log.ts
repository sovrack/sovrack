export type AuditLogUser = {
  id: string;
  email: string;
  fullName: string;
};

export type AuditLogItem = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: AuditLogUser;
};

export type AuditLogPage = {
  data: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
