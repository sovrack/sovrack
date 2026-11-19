"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dnsService } from "@/features/platform/api/dns.service";

/** Clé de cache des domaines d'une instance (service × environnement). */
const domainsKey = (serviceEnvId: string | null) =>
  ["service-domains", serviceEnvId] as const;

/** Domaines rattachés à une instance service×env. Inactif tant que `serviceEnvId` est null. */
export function useServiceDomains(serviceEnvId: string | null) {
  return useQuery({
    queryKey: domainsKey(serviceEnvId),
    queryFn: () =>
      dnsService.listDomains({ serviceEnvId: serviceEnvId as string }),
    enabled: Boolean(serviceEnvId),
  });
}

export function useCreateDomain(serviceEnvId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; projectId: string }) =>
      dnsService.createDomain({
        name: input.name,
        projectId: input.projectId,
        serviceEnvId: serviceEnvId as string,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: domainsKey(serviceEnvId) }),
  });
}

export function useDeleteDomain(serviceEnvId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dnsService.deleteDomain(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: domainsKey(serviceEnvId) }),
  });
}
