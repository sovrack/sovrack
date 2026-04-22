import { BadRequestException } from '@nestjs/common';
import { ServerExecutionOptions } from './servers.types';

export function assertSafeLinuxUsername(username: string): void {
  const safePattern = /^[a-z_][a-z0-9_-]{0,30}$/i;
  if (!safePattern.test(username)) {
    throw new BadRequestException(
      'Username SSH invalide: caractères non autorisés',
    );
  }
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

export function onAbort(
  signal: AbortSignal | undefined,
  handler: () => void,
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    handler();
    return () => {};
  }
  const listener = () => handler();
  signal.addEventListener('abort', listener, { once: true });
  return () => signal.removeEventListener('abort', listener);
}

export function assertNotAborted(options?: ServerExecutionOptions): void {
  if (!options?.signal.aborted) return;
  throw new BadRequestException(`JOB_TIMEOUT_${String(options.timeoutMs)}`);
}
