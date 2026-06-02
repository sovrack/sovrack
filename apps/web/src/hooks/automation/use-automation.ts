'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { automationService } from '@/services/automation.service';
import type { CreateAutomationRunPayload } from '@/types/automation';

export const automationKeys = {
  all: ['automation'] as const,
  actions: () => [...automationKeys.all, 'actions'] as const,
  runs: (page: number, pageSize: number) =>
    [...automationKeys.all, 'runs', page, pageSize] as const,
  run: (id: string) => [...automationKeys.all, 'run', id] as const,
  runLogs: (id: string) => [...automationKeys.all, 'run-logs', id] as const,
};

export function useAutomationActions() {
  return useQuery({
    queryKey: automationKeys.actions(),
    queryFn: () => automationService.getActions(),
  });
}

export function useAutomationRuns(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: automationKeys.runs(page, pageSize),
    queryFn: () => automationService.getRuns(page, pageSize),
    refetchInterval: 5_000,
  });
}

export function useAutomationRun(id: string | null) {
  return useQuery({
    queryKey: id ? automationKeys.run(id) : [...automationKeys.all, 'run', 'none'],
    queryFn: () => automationService.getRun(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
}

export function useAutomationRunLogs(runId: string | null) {
  return useQuery({
    queryKey: runId
      ? automationKeys.runLogs(runId)
      : [...automationKeys.all, 'run-logs', 'none'],
    queryFn: () => automationService.getRunLogs(runId ?? ''),
    enabled: Boolean(runId),
    refetchInterval: 2_000,
  });
}

export function useStartAutomationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAutomationRunPayload) =>
      automationService.startRun(payload),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
      queryClient.setQueryData(automationKeys.run(run.id), run);
    },
  });
}

export function useCancelAutomationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationService.cancelRun(id),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
      queryClient.setQueryData(automationKeys.run(run.id), run);
    },
  });
}

export function useDeleteAutomationRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationService.deleteRun(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: automationKeys.all });
    },
  });
}
