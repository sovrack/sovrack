import { GitProviderType, ServerRunStatus } from '@prisma/client';

// ─── SOURCE UNIQUE POUR TOUS LES ÉVÉNEMENTS CROSS-MODULE ─────────────────────
// Importer ICI et nulle part ailleurs (jamais depuis un module voisin).
// Règle : un module ne doit jamais importer les events d'un autre module.

// ─── Deployment events ────────────────────────────────────────────────────────
export const DEPLOYMENT_PIPELINE_UPDATED = 'deployment.pipeline.updated';
export const DEPLOYMENT_AUTO_DEPLOY_TRIGGER = 'deployment.auto_deploy.trigger';

export type PipelineUpdatedEvent = {
  pipelineId: number;
  webhookStatus: string;
  image?: string;
  provider?: GitProviderType;
};

export type AutoDeployTriggerEvent = {
  projectId: string;
  branch: string;
  dockerImage?: string;
  pipelineId?: number;
  serviceId?: string;
};

// ─── Automation events ────────────────────────────────────────────────────────
export const AUTOMATION_RUN_COMPLETED = 'automation.run.completed';

export type AutomationRunCompletedEvent = {
  runId: string;
  actionKey: string;
  status: ServerRunStatus;
  succeededHosts: string[];
};
