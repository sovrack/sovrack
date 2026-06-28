/**
 * Maps per-service resource quotas to the Docker HostConfig fields that enforce
 * them. Quotas keep one tenant's app from starving the others on a shared host.
 * Null/zero/absent = unlimited (the field is omitted so Docker applies no cap).
 *
 * - cpuLimit is in CPU cores (e.g. 0.5 = half a core) → HostConfig.NanoCpus
 *   (cores * 1e9).
 * - memLimitMb is in megabytes → HostConfig.Memory (bytes).
 */
export type ResourceLimits = {
  cpuLimit?: number | null;
  memLimitMb?: number | null;
};

export type DockerResourceConfig = {
  NanoCpus?: number;
  Memory?: number;
};

export function toDockerResourceConfig(
  limits: ResourceLimits | null | undefined,
): DockerResourceConfig {
  const config: DockerResourceConfig = {};
  if (limits?.cpuLimit && limits.cpuLimit > 0) {
    config.NanoCpus = Math.round(limits.cpuLimit * 1e9);
  }
  if (limits?.memLimitMb && limits.memLimitMb > 0) {
    config.Memory = limits.memLimitMb * 1024 * 1024;
  }
  return config;
}
