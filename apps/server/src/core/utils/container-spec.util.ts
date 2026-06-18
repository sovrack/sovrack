/**
 * Helpers PURS de spécification de conteneur, extraits de
 * DockerDeployExecutorService (découpe du god-service). Aucune dépendance, donc
 * testables isolément ; comportement identique à l'inline d'origine.
 */

/** Préfixe de conteneur `deploy-<projet>-<service>-` normalisé (Docker-safe). */
export function buildContainerPrefix(
  projectName: string,
  serviceName: string,
): string {
  return `deploy-${projectName}-${serviceName}-`
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

/** Nom complet de conteneur = préfixe + 8 premiers caractères de l'ID de déploiement. */
export function buildContainerName(
  projectName: string,
  serviceName: string,
  deploymentId: string,
): string {
  return `${buildContainerPrefix(projectName, serviceName)}${deploymentId.slice(0, 8)}`;
}

/** Convertit des entrées d'env en tableau Docker `KEY=VALUE`. */
export function toDockerEnvArray(
  entries: { key: string; value: string }[],
): string[] {
  return entries.map((entry) => `${entry.key}=${entry.value}`);
}

export type platformLabelInput = {
  projectId: string;
  projectName: string;
  serviceId?: string | null;
  serviceName: string;
  environmentName?: string | null;
  serviceEnvId?: string | null;
  deploymentId: string;
};

/**
 * Labels `platform.*` posés sur le conteneur → exposés par cAdvisor
 * (container_label_platform_*) pour filtrer le monitoring par projet / service /
 * environnement / déploiement.
 */
export function buildplatformLabels(
  input: platformLabelInput,
): Record<string, string> {
  return {
    'platform.managed': 'true',
    'platform.project': input.projectId,
    'platform.project_name': input.projectName,
    'platform.service': input.serviceId ?? '',
    'platform.service_name': input.serviceName,
    'platform.environment': input.environmentName ?? '',
    'platform.service_env': input.serviceEnvId ?? '',
    'platform.deployment': input.deploymentId,
  };
}
