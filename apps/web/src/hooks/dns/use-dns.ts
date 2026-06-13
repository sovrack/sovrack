'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dnsService } from '@/services/dns.service';
import { getApiErrorMessage } from '@/lib/api';

/** Fournisseurs DNS configurés. */
export function useDnsProviders() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dns', 'providers'],
    queryFn: () => dnsService.listProviders(),
  });

  return {
    providers: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dns', 'providers'] });
      await refetch();
    },
  };
}

/** Domaines (optionnellement filtrés par projet). */
export function useDnsDomains(projectId?: string) {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dns', 'domains', projectId ?? 'all'],
    queryFn: () => dnsService.listDomains(projectId),
  });

  return {
    domains: data ?? [],
    loading: isLoading,
    error: error ? getApiErrorMessage(error) : null,
    refresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dns', 'domains', projectId ?? 'all'] });
      await refetch();
    },
  };
}
