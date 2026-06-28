import { Prisma } from '@prisma/client';

// Capability keys written by ServersDetectionService (see DETECTION_TOOLS).
// Values are stored as 'true' / 'false' strings in the Server.capabilities map.
export const DOCKER_CAPABILITY_KEY = 'docker.installed';
export const RUNNER_CAPABILITY_KEY = 'gitlab_runner.installed';

/**
 * Reads a boolean capability from a Server's `capabilities` JSON map — the
 * single source of truth, written by detection. Replaces the former
 * denormalized `Server.hasDocker` / `Server.hasRunner` columns (which could
 * drift from the real detected state).
 */
export function hasServerCapability(
  capabilities: Prisma.JsonValue | null | undefined,
  capabilityKey: string,
): boolean {
  if (
    !capabilities ||
    typeof capabilities !== 'object' ||
    Array.isArray(capabilities)
  ) {
    return false;
  }
  return (capabilities as Record<string, unknown>)[capabilityKey] === 'true';
}

export function serverHasDocker(server: {
  capabilities: Prisma.JsonValue | null;
}): boolean {
  return hasServerCapability(server.capabilities, DOCKER_CAPABILITY_KEY);
}

export function serverHasRunner(server: {
  capabilities: Prisma.JsonValue | null;
}): boolean {
  return hasServerCapability(server.capabilities, RUNNER_CAPABILITY_KEY);
}
