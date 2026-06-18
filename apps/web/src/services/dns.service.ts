import api from '@/lib/api';
import type { DnsProvider, DnsProviderType, Domain } from '@/types/dns';

export const dnsService = {
  async listProviders(): Promise<DnsProvider[]> {
    const res = await api.get<DnsProvider[]>('/dns/providers');
    return res.data;
  },

  async createProvider(payload: {
    name: string;
    type: DnsProviderType;
    apiToken?: string;
    accountId?: string;
    zoneId?: string;
  }): Promise<DnsProvider> {
    const res = await api.post<DnsProvider>('/dns/providers', payload);
    return res.data;
  },

  async testProvider(id: string): Promise<{ ok: boolean; status: string; message: string }> {
    const res = await api.post<{ ok: boolean; status: string; message: string }>(
      `/dns/providers/${id}/test`,
    );
    return res.data;
  },

  async listDomains(filters?: { projectId?: string; serviceEnvId?: string }): Promise<Domain[]> {
    const res = await api.get<Domain[]>('/dns/domains', {
      params: filters,
    });
    return res.data;
  },

  async createDomain(payload: {
    name: string;
    providerId?: string;
    projectId?: string;
    serviceEnvId?: string;
  }): Promise<Domain> {
    const res = await api.post<Domain>('/dns/domains', payload);
    return res.data;
  },

  async deleteDomain(id: string): Promise<void> {
    await api.delete(`/dns/domains/${id}`);
  },
};
