import api from "@/shared/lib/api";
import type {
  Service,
  ServiceCredentials,
  CreateServicePayload,
  UpdateServicePayload,
  DiscoveredRepo,
  ServiceTemplate,
} from "@/features/projects/types/service";

/**
 * Service-level API (M3 model). Targets `POST /projects/:projectId/services`
 * and friends. Creating a service auto-links it to every environment of the
 * project on the backend, so no separate environment-binding call is needed.
 */
export const servicesService = {
  async getAll(projectId: string): Promise<Service[]> {
    const res = await api.get<Service[]>(`/projects/${projectId}/services`);
    return res.data;
  },

  async create(
    projectId: string,
    payload: CreateServicePayload,
  ): Promise<Service> {
    const res = await api.post<Service>(
      `/projects/${projectId}/services`,
      payload,
    );
    return res.data;
  },

  async remove(projectId: string, serviceId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/services/${serviceId}`);
  },

  /**
   * DATABASE credentials from the DEDICATED, gated endpoint — kept off the
   * general getAll() listing (which omits them) so this never reintroduces the
   * Task 1 leak. Loaded on demand only when the Credentials panel is opened.
   */
  async getCredentials(
    projectId: string,
    serviceId: string,
  ): Promise<ServiceCredentials> {
    const res = await api.get<ServiceCredentials>(
      `/projects/${projectId}/services/${serviceId}/credentials`,
    );
    return res.data;
  },

  async update(
    projectId: string,
    serviceId: string,
    payload: UpdateServicePayload,
  ): Promise<Service> {
    const res = await api.put<Service>(
      `/projects/${projectId}/services/${serviceId}`,
      payload,
    );
    return res.data;
  },

  /**
   * Discover every repo under a GitLab group / GitHub org so the wizard can
   * bulk-create one service per selected repo.
   */
  async discoverGroup(
    projectId: string,
    payload: {
      provider: "GITLAB" | "GITHUB";
      groupPath: string;
      token: string;
      providerId?: string;
    },
  ): Promise<DiscoveredRepo[]> {
    const res = await api.post<DiscoveredRepo[]>(
      `/projects/${projectId}/services/discover-group`,
      payload,
    );
    return res.data;
  },

  /** One-click service templates (multi-component bundles, e.g. Postgres+pgAdmin). */
  async listTemplates(projectId: string): Promise<ServiceTemplate[]> {
    const res = await api.get<ServiceTemplate[]>(
      `/projects/${projectId}/services/templates`,
    );
    return res.data;
  },

  /** Atomically creates every component of a template under one base name. */
  async createFromTemplate(
    projectId: string,
    templateId: string,
    name: string,
  ): Promise<Service[]> {
    const res = await api.post<Service[]>(
      `/projects/${projectId}/services/templates/${templateId}`,
      { name },
    );
    return res.data;
  },
};
