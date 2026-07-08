import { DeploymentStrategy, Prisma, ServiceType } from '@prisma/client';
import { BLUE_GREEN_PORT_OFFSET } from '../utils/blue-green.constants';
import type { ResolvedRuntimeConfig } from './replica-launcher.service';

// ─── Runtime config ──────────────────────────────────────────────────────────

/** Subset of Deployment.specSnapshot the executor consumes (see deployments-create). */
export interface RuntimeSpecSnapshot {
  port?: number | null;
  startCommand?: string | null;
  healthcheckPath?: string | null;
  cpuLimit?: number | null;
  memLimitMb?: number | null;
  replicas?: number | null;
}

/** Input contract for resolveRuntimeConfig. */
export interface RuntimeConfigInput {
  isRollback: boolean;
  isAutoHealed: boolean;
  specSnapshot: Prisma.JsonValue;
  service: {
    port: number | null;
    startCommand: string | null;
    healthcheckPath: string | null;
    cpuLimit: number | null;
    memLimitMb: number | null;
    replicas?: number | null;
  } | null;
}

/**
 * Resolve the runtime config to apply to the container.
 *
 * For a ROLLBACK or AUTO-HEAL deployment we prefer the FROZEN specSnapshot
 * captured at the original deploy (true point-in-time restore: same port,
 * start command, healthcheck and resource limits as the release being
 * restored), falling back to live config field-by-field if the snapshot is
 * missing a value. A normal deploy has no snapshot yet, so it uses live
 * config unchanged — behaviour identical to before this method existed.
 *
 * Env vars are deliberately NOT taken from the snapshot: secrets must never be
 * stored there, so env always comes from live config (resolveDeploymentEnv).
 *
 * NB: la précédence snapshot→service→défaut 3000 est un point de
 * synchronisation avec DeploymentPreflightService (voir
 * EXPLORATION_BACKEND_DEPENDANCES.md section 3) — ne pas modifier sans
 * mettre à jour le pré-vol en parallèle.
 */
export function resolveRuntimeConfig(
  deployment: RuntimeConfigInput,
): ResolvedRuntimeConfig {
  const usePinned =
    (deployment.isRollback || deployment.isAutoHealed) &&
    deployment.specSnapshot != null &&
    typeof deployment.specSnapshot === 'object' &&
    !Array.isArray(deployment.specSnapshot);
  const snap = usePinned
    ? (deployment.specSnapshot as RuntimeSpecSnapshot)
    : null;
  const service = deployment.service;
  return {
    port: snap?.port ?? service?.port ?? 3000,
    startCommand: snap?.startCommand ?? service?.startCommand ?? null,
    healthcheckPath: snap?.healthcheckPath ?? service?.healthcheckPath ?? null,
    cpuLimit: snap?.cpuLimit ?? service?.cpuLimit ?? null,
    memLimitMb: snap?.memLimitMb ?? service?.memLimitMb ?? null,
    replicas: snap?.replicas ?? service?.replicas ?? 1,
  };
}

// ─── Port / strategy resolution ──────────────────────────────────────────────

export interface PortAssignmentInput {
  strategy: DeploymentStrategy;
  serviceType: ServiceType;
  useTraefik: boolean;
  servicePort: number;
  dbExternalPort: number | null;
}

export interface PortAssignmentResult {
  publishPort: number;
  blueGreen: boolean;
  dbHostPortDisabled: boolean;
  canOverlap: boolean;
  publishesHostPort: boolean;
}

/**
 * Resolve the publish port and deployment strategy metadata.
 *
 * - Blue-green: the green container publishes on `servicePort + 1` so it can
 *   run alongside the live (blue) container until verified healthy.
 * - DATABASE services publish no host port by default (dbHostPortDisabled)
 *   unless the user sets Service.externalPort.
 * - Traefik / blue-green containers can overlap with old ones (zero-downtime);
 *   otherwise stop old first to free the host port.
 * - WORKER / CRON never publish a host port (publishesHostPort = false).
 */
export function resolvePortAssignment(
  input: PortAssignmentInput,
): PortAssignmentResult {
  const isDatabase = input.serviceType === ServiceType.DATABASE;
  const dbHostPortDisabled = isDatabase && input.dbExternalPort == null;
  const blueGreen =
    input.strategy === DeploymentStrategy.BLUE_GREEN &&
    !isDatabase &&
    !input.useTraefik;

  const publishPort = blueGreen
    ? input.servicePort + BLUE_GREEN_PORT_OFFSET
    : isDatabase && input.dbExternalPort != null
      ? input.dbExternalPort
      : input.servicePort;
  const canOverlap = input.useTraefik || blueGreen;
  const publishesHostPort =
    !input.useTraefik &&
    !dbHostPortDisabled &&
    (input.serviceType as string) !== 'WORKER' &&
    (input.serviceType as string) !== 'CRON';

  return {
    publishPort,
    blueGreen,
    dbHostPortDisabled,
    canOverlap,
    publishesHostPort,
  };
}

// ─── Notification context ────────────────────────────────────────────────────

export interface DeploymentNotificationContext {
  projectName: string;
  environmentName: string;
  branch: string;
  triggeredBy: string;
}

/**
 * Extract the common notification context from a deployment object.
 * Used by both success and failure notification paths.
 */
export function buildDeploymentNotificationContext(deployment: {
  project: { name: string };
  serviceEnv?: { environment?: { name?: string } | null } | null;
  environment?: { name?: string } | null;
  branch?: string | null;
  user?: { email?: string } | null;
}): DeploymentNotificationContext {
  return {
    projectName: deployment.project.name,
    environmentName:
      deployment.serviceEnv?.environment?.name ??
      deployment.environment?.name ??
      '',
    branch: deployment.branch ?? '',
    triggeredBy: deployment.user?.email ?? 'auto',
  };
}
