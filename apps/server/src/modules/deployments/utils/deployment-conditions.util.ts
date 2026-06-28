import { Prisma } from '@prisma/client';

/**
 * Forme UNIQUE et partagée du champ `Deployment.conditions` (style Kubernetes).
 *
 * Contrat : `conditions` est TOUJOURS un TABLEAU de {@link DeploymentCondition}.
 * Le DTO de réponse, le frontend (deployment-logs-dialog), l'executor, le
 * reconciler et la reprise des stale le lisent comme un tableau (`conditions[0]`,
 * `conditions.length`). Écrire un objet seul (ancienne dette de
 * deployments-create) rendait la condition INVISIBLE dans l'UI
 * (`{...}.length === undefined`). Ce util force la forme tableau partout.
 */
export type DeploymentConditionType = 'Ready' | 'Progressing' | 'Degraded';
export type DeploymentConditionStatus = 'True' | 'False' | 'Unknown';

export interface DeploymentCondition {
  type: DeploymentConditionType;
  status: DeploymentConditionStatus;
  reason: string;
  message: string;
  lastTransitionAt: string;
}

/** Cast typé d'un tableau de conditions vers la valeur JSON attendue par Prisma. */
export function conditionsToJson(
  conditions: DeploymentCondition[],
): Prisma.InputJsonValue {
  return conditions as unknown as Prisma.InputJsonValue;
}

/**
 * Condition « Degraded » pour un déploiement récupéré après blocage (stale).
 * `reason` distingue la source : StaleRecovery (au lancement d'un nouveau
 * déploiement) vs AutoRecovered (cron de reprise globale).
 */
export function staleDegradedCondition(
  reason: 'StaleRecovery' | 'AutoRecovered',
  message: string,
): DeploymentCondition[] {
  return [
    {
      type: 'Degraded',
      status: 'False',
      reason,
      message,
      lastTransitionAt: new Date().toISOString(),
    },
  ];
}

/** Condition posée quand le réconciliateur recrée un conteneur mort/disparu. */
export function containerCrashedCondition(
  observedStatus: string,
): DeploymentCondition[] {
  return [
    {
      type: 'Ready',
      status: 'False',
      reason: 'ContainerCrashed',
      message: `Container observed ${observedStatus}; reconciler is recreating it.`,
      lastTransitionAt: new Date().toISOString(),
    },
  ];
}

/**
 * Condition « dérive de config » (état désiré ≠ état déployé) : la cellule a une
 * `generation` supérieure à `observedGeneration` du déploiement live → la config
 * a changé mais n'est pas appliquée. Marqué OutOfSync, SANS redéploiement auto
 * (l'application reste une décision explicite — surtout en prod).
 */
export function configDriftCondition(
  desiredGeneration: number,
  observedGeneration: number,
): DeploymentCondition[] {
  return [
    {
      type: 'Progressing',
      status: 'False',
      reason: 'ConfigDrift',
      message:
        `Configuration modifiée (génération ${desiredGeneration}) mais le ` +
        `déploiement live est en génération ${observedGeneration}. ` +
        `Redéployez pour appliquer.`,
      lastTransitionAt: new Date().toISOString(),
    },
  ];
}
