import type Docker from 'dockerode';
import {
  toDockerResourceConfig,
  type ResourceLimits,
} from './resource-limits.util';

/**
 * Pure builder for the Docker container-create spec used by the deploy executor.
 * Centralises the port/Traefik/quota/labels/binds/network rules so they can be
 * unit-tested in isolation (the executor just calls docker.createContainer with
 * the result). No I/O — deterministic inputs → spec.
 */
export type ContainerSpecInput = {
  imageRef: string;
  containerName: string;
  labels: Record<string, string>;
  envVars: string[];
  /** Container's internal port. */
  servicePort: number;
  /** Host port to publish (host-port mode only). */
  publishPort: number;
  /** Traefik routing → no host port published. */
  useTraefik: boolean;
  /**
   * DATABASE service without externalPort → no host port published (Task 4).
   * Still exposes the internal port so other containers reach it on the
   * project network by alias.
   */
  dbHostPortDisabled?: boolean;
  serviceType?: string | null;
  startCommand?: string | null;
  stopTimeout: number;
  /** Volume binds ("name:/path"). */
  binds: string[];
  /** Per-project Docker network. */
  networkMode: string;
  /** Stable DNS alias on the project network. */
  networkAlias: string;
  resourceLimits: ResourceLimits | null | undefined;
};

function isNonPublishing(serviceType?: string | null): boolean {
  return serviceType === 'WORKER' || serviceType === 'CRON';
}

export function buildContainerCreateSpec(
  input: ContainerSpecInput,
): Docker.ContainerCreateOptions {
  const {
    imageRef,
    containerName,
    labels,
    envVars,
    servicePort,
    publishPort,
    useTraefik,
    dbHostPortDisabled,
    serviceType,
    startCommand,
    stopTimeout,
    binds,
    networkMode,
    networkAlias,
    resourceLimits,
  } = input;

  const noHostPort =
    useTraefik || Boolean(dbHostPortDisabled) || isNonPublishing(serviceType);

  return {
    Image: imageRef,
    name: containerName,
    Labels: labels,
    Env: envVars,
    // WORKER/CRON expose nothing; web services expose their service port.
    ExposedPorts: isNonPublishing(serviceType)
      ? undefined
      : { [`${servicePort}/tcp`]: {} },
    StopTimeout: stopTimeout,
    HostConfig: {
      // Safe baseline for every customer workload. These controls do not make
      // the root filesystem immutable (many third-party images legitimately
      // write at runtime), but they prevent privilege escalation, remove the
      // default Linux capability set and cap fork-bomb impact.
      SecurityOpt: ['no-new-privileges:true'],
      CapDrop: ['ALL'],
      PidsLimit: 256,
      Init: true,
      // Traefik mode / workers / cron → no host port binding.
      PortBindings: noHostPort
        ? {}
        : { [`${servicePort}/tcp`]: [{ HostPort: String(publishPort) }] },
      RestartPolicy: {
        Name: serviceType === 'CRON' ? 'no' : 'unless-stopped',
      },
      // Resource quotas (multi-tenant safety). Null/0 = unlimited (omitted).
      ...toDockerResourceConfig(resourceLimits),
      AutoRemove: false,
      Binds: binds,
      NetworkMode: networkMode,
    },
    // Stable DNS alias on the project network → other containers reach it by a
    // fixed name across redeploys.
    NetworkingConfig: {
      EndpointsConfig: {
        [networkMode]: { Aliases: [networkAlias] },
      },
    },
    Cmd: startCommand ? ['sh', '-c', startCommand] : undefined,
  };
}
