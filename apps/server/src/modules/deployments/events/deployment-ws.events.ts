// Événements INTERNES au module deployments : le cœur (core/, triggers/,
// health/) publie la progression ; la couche présentation (gateways/) écoute
// et pousse au client WebSocket. Évite l'inversion de couche core/ → gateways/.

export const DEPLOYMENT_WS_STARTED = 'deployment.ws.started';
export const DEPLOYMENT_WS_LOG = 'deployment.ws.log';
export const DEPLOYMENT_WS_STATUS = 'deployment.ws.status';
export const DEPLOYMENT_WS_FINISHED = 'deployment.ws.finished';

export type DeploymentLogLevel = 'info' | 'error' | 'success';

export type DeploymentStartedPayload = {
  deploymentId: string;
  projectId?: string;
  environmentId?: string;
  status?: string;
  startedAt?: Date | null;
  initiatorRole?: string;
};

export type DeploymentLogPayload = {
  deploymentId: string;
  message: string;
  level: DeploymentLogLevel;
  timestamp: string;
};

export type DeploymentStatusPayload = {
  deploymentId: string;
  status: string;
};

export type DeploymentFinishedPayload = {
  deploymentId: string;
  status: string;
  finishedAt?: Date | null;
};
