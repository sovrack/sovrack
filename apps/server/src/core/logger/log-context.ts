import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request / per-operation logging context propagated automatically through
 * async calls. Lets every log line (HTTP middleware, services, deploy executor)
 * carry the same correlationId without threading it through every signature.
 */
export interface LogContextStore {
  correlationId: string;
  deploymentId?: string;
  serviceEnvId?: string;
  userId?: string;
}

export const logContext = new AsyncLocalStorage<LogContextStore>();

/** Current context (or empty when running outside a tracked scope). */
export function getLogContext(): Partial<LogContextStore> {
  return logContext.getStore() ?? {};
}

/** Run `fn` within a fresh logging context (HTTP request, deploy job…). */
export function runWithLogContext<T>(store: LogContextStore, fn: () => T): T {
  return logContext.run(store, fn);
}

/** Enrich the active context in place (e.g. add deploymentId once known). */
export function setLogContext(patch: Partial<LogContextStore>): void {
  const current = logContext.getStore();
  if (current) {
    Object.assign(current, patch);
  }
}
