export const DEPLOYMENT_PIPELINE_UPDATED = 'deployment.pipeline.updated';
export const DEPLOYMENT_AUTO_DEPLOY_TRIGGER = 'deployment.auto_deploy.trigger';

export type PipelineUpdatedEvent = {
  pipelineId: number;
  webhookStatus: string;
  image?: string;
};

export type AutoDeployTriggerEvent = {
  projectId: string;
  branch: string;
  dockerImage?: string;
  pipelineId?: number;
  serviceId?: string;
};
