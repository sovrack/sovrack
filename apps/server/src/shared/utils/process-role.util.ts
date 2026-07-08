/**
 * PROCESS_ROLE gates the background-work entry points (crons + BullMQ queue
 * consumers) so the same compiled image can run as two process roles:
 *
 *   unset / "all" → one process does everything (dev + backwards-compatible
 *                   default: a bare `docker run` keeps today's behavior).
 *   "api"         → serves HTTP/WebSocket only; runs NO crons, NO queue
 *                   consumers (never touches target infra itself).
 *   "worker"      → runs crons + queue consumers (Ansible, Docker-API deploys).
 *
 * Both roles still bootstrap the HTTP/WebSocket server (the worker's port is
 * simply left unmapped in compose): the worker needs a live Socket.IO instance
 * so its gateway emits fan out to API-connected clients via the Redis adapter.
 */
type ProcessRole = 'api' | 'worker' | 'all';

function processRole(): ProcessRole {
  const raw = (process.env.PROCESS_ROLE ?? 'all').trim().toLowerCase();
  if (raw === 'api') return 'api';
  if (raw === 'worker') return 'worker';
  return 'all';
}

/**
 * True when this process should run background work — crons and BullMQ queue
 * consumers. Includes the default single-process ("all") mode so dev and a
 * plain `docker run` keep running everything.
 */
export function runsBackgroundWork(): boolean {
  return processRole() !== 'api';
}
