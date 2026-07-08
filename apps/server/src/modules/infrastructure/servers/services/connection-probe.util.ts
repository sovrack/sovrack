import { Socket } from 'net';

export class JobTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`JOB_TIMEOUT_${String(timeoutMs)}`);
  }
}

export async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutRef: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutRef = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Ne pas masquer l'erreur de timeout.
      }
      reject(new JobTimeoutError(timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } finally {
    if (timeoutRef) {
      clearTimeout(timeoutRef);
    }
  }
}

/**
 * A3: lightweight "is this server reachable right now" probe — a raw TCP
 * connect-and-close to the SSH port, no authentication, no host-key
 * pinning, no logging, no Server state mutation.
 */
export async function pingReachable(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}
