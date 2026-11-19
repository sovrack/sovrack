import api from "@/shared/lib/api";
import type {
  Environment,
  CreateEnvironmentPayload,
  UpdateEnvironmentPayload,
} from "@/features/projects/types/environment";
import type { ServiceEnvironment } from "@/features/projects/types/service-environment";

type RawServiceLink = {
  id: string;
  serviceId: string;
  environmentId: string;
  service: Record<string, unknown>;
  deployments?: Array<{
    id: string;
    status: string;
    branch: string | null;
    createdAt: string;
    finishedAt: string | null;
    user: { fullName: string } | null;
  }>;
};

function normalizeEnvironments(envs: unknown[]): Environment[] {
  return (envs as Array<Record<string, unknown>>).map((env) => ({
    ...(env as object),
    serviceLinks: ((env.serviceLinks ?? []) as RawServiceLink[]).map(
      (link) => ({
        ...link,
        lastDeployment: link.deployments?.[0] ?? null,
      }),
    ),
  })) as Environment[];
}

export const environmentsService = {
  async getAll(projectId: string): Promise<Environment[]> {
    const res = await api.get<unknown[]>(`/projects/${projectId}/environments`);
    return normalizeEnvironments(res.data);
  },

  async create(
    projectId: string,
    payload: CreateEnvironmentPayload,
  ): Promise<Environment> {
    const res = await api.post<Environment>(
      `/projects/${projectId}/environments`,
      payload,
    );
    return res.data;
  },

  async getById(projectId: string, envId: string): Promise<Environment> {
    const res = await api.get<Environment>(
      `/projects/${projectId}/environments/${envId}`,
    );
    return res.data;
  },

  async update(
    projectId: string,
    envId: string,
    payload: UpdateEnvironmentPayload,
  ): Promise<Environment> {
    const res = await api.put<Environment>(
      `/projects/${projectId}/environments/${envId}`,
      payload,
    );
    return res.data;
  },

  async remove(projectId: string, envId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/environments/${envId}`);
  },

  // Le détail d'un environnement inclut déjà ses serveurs (environmentsInclude
  // backend) — pas de route GET dédiée : on lit le détail et on renvoie .servers.
  async getServers(projectId: string, envId: string): Promise<unknown[]> {
    const env = await this.getById(projectId, envId);
    return ((env as { servers?: unknown[] }).servers ?? []) as unknown[];
  },

  // Backend : POST /projects/:id/environments/:envId/servers/:serverId (serverId
  // dans le PATH, pas dans le body).
  async assignServer(
    projectId: string,
    envId: string,
    serverId: string,
  ): Promise<void> {
    await api.post(
      `/projects/${projectId}/environments/${envId}/servers/${serverId}`,
    );
  },

  async removeServer(
    projectId: string,
    envId: string,
    serverId: string,
  ): Promise<void> {
    await api.delete(
      `/projects/${projectId}/environments/${envId}/servers/${serverId}`,
    );
  },

  // Backend : GET /projects/:id/environments/:envId/services
  async getServiceLinks(
    projectId: string,
    envId: string,
  ): Promise<ServiceEnvironment[]> {
    const res = await api.get<ServiceEnvironment[]>(
      `/projects/${projectId}/environments/${envId}/services`,
    );
    return res.data;
  },

  // Backend : POST /projects/:id/environments/:envId/services/:serviceId
  async linkService(
    projectId: string,
    envId: string,
    serviceId: string,
  ): Promise<void> {
    await api.post(
      `/projects/${projectId}/environments/${envId}/services/${serviceId}`,
    );
  },

  // Un "service link" EST un ServiceEnvironment → suppression via son contrôleur dédié.
  async unlinkService(projectId: string, serviceLinkId: string): Promise<void> {
    await api.delete(
      `/projects/${projectId}/service-environments/${serviceLinkId}`,
    );
  },

  // Détail d'un ServiceEnvironment (inclut env ; secretsEnv jamais renvoyé en clair).
  async getServiceLink(
    projectId: string,
    id: string,
  ): Promise<ServiceEnvironment> {
    const res = await api.get<ServiceEnvironment>(
      `/projects/${projectId}/service-environments/${id}`,
    );
    return res.data;
  },

  // Config de CE service × CET environnement : variables (claires + secrètes
  // chiffrées) + auto-deploy (push→deploy) + branche déclencheuse. Le build
  // (port/startCommand/healthcheckPath/buildPack) n'a plus de variation par
  // environnement — c'est une propriété unique du Service, éditée dans son
  // onglet Build/General (voir la mission "Correction rapide" qui a retiré
  // ces 5 champs de ce formulaire). Un champ omis laisse la valeur stockée
  // inchangée.
  async updateServiceLink(
    projectId: string,
    id: string,
    payload: {
      env?: string;
      secretsEnv?: string;
      autoDeploy?: boolean;
      autoBranch?: string;
    },
  ): Promise<void> {
    await api.put(`/projects/${projectId}/service-environments/${id}`, payload);
  },
};
