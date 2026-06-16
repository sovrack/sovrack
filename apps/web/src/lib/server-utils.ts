import type { Server, ServerJob } from '@/types/server';

/**
 * Pure presentation/predicate helpers for servers & server jobs, extracted from
 * the (large) useServerActions hook so they can be reused and unit-tested
 * without React — see PLAN_AMELIORATION.md §4.4.
 */

export function formatJobType(type: ServerJob['type']): string {
  if (type === 'INSTALL_TOOLS') return 'Legacy setup';
  if (type === 'PREPARE_SERVER') return 'Prepare Server';
  if (type === 'REGISTER_RUNNER') return 'Register Runner';
  return 'Validate SSH';
}

export function formatConnectionMode(mode: Server['connectionMode']): string {
  return mode.toUpperCase();
}

export function canRetryJob(job: ServerJob): boolean {
  const retryableStatuses: ServerJob['status'][] = ['FAILED', 'TIMEOUT', 'BLOCKED'];
  return retryableStatuses.includes(job.status) && job.type !== 'REGISTER_RUNNER';
}

export function canCancelJob(job: ServerJob): boolean {
  const cancelableStatuses: ServerJob['status'][] = ['RUNNING', 'PENDING', 'BLOCKED'];
  return cancelableStatuses.includes(job.status);
}

export function getJobStatusClassName(status: ServerJob['status']): string {
  if (status === 'SUCCESS') {
    return 'border-green-500/20 bg-green-500/10 text-green-400';
  }
  if (status === 'FAILED' || status === 'TIMEOUT' || status === 'BLOCKED') {
    return 'border-red-500/30 bg-red-500/10 text-red-400';
  }
  if (status === 'RUNNING' || status === 'PENDING') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  }
  return 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400';
}
