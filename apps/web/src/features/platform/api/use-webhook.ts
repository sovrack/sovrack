'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webhooksService } from '@/features/platform/api/webhooks.service';

const webhookKey = (projectId: string, serviceId: string) =>
  ['webhook', projectId, serviceId] as const;

/** État du webhook auto-deploy d'un service (configuré ? actif ?). */
export function useWebhookStatus(projectId: string, serviceId: string) {
  return useQuery({
    queryKey: webhookKey(projectId, serviceId),
    queryFn: () => webhooksService.status(projectId, serviceId),
    enabled: Boolean(projectId && serviceId),
  });
}

/** (Ré)enregistre le webhook sur le repo. */
export function useConfigureWebhook(projectId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webhooksService.configure(projectId, serviceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookKey(projectId, serviceId) }),
  });
}

/** Met en pause (si actif) ou réactive le webhook. */
export function useToggleWebhook(projectId: string, serviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isActive: boolean) =>
      isActive
        ? webhooksService.pause(projectId, serviceId)
        : webhooksService.resume(projectId, serviceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: webhookKey(projectId, serviceId) }),
  });
}
