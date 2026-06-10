import type { components, paths } from '@/generated/api-contract';

export type ApiSchema = components['schemas'];

export type ServerApi = ApiSchema['ServerResponseDto'];
export type CreateServerApiPayload = ApiSchema['CreateServerDto'];
export type CreateServerApiResult = ApiSchema['CreateServerResponseDto'];
export type UpdateServerApiPayload = ApiSchema['UpdateServerDto'];
export type RegisterRunnerApiPayload = ApiSchema['RegisterRunnerDto'];
export type InstallServerKeyApiPayload = ApiSchema['InstallKeyDto'];
export type InstallServerKeyApiResult = ApiSchema['InstallKeyResponseDto'];
export type ServerJobApi = ApiSchema['ServerJobResponseDto'];
export type ServerDeleteApiResult = ApiSchema['DeleteServerResponseDto'];
export type ServersListApiQuery =
  paths['/servers']['get']['parameters']['query'];
export type ServersListApiResult =
  paths['/servers']['get']['responses']['200']['content']['application/json'];

export type DeploymentApi = ApiSchema['DeploymentDetailedResponseDto'];
export type DeploymentMutationApi = ApiSchema['DeploymentResponseDto'];
export type CreateDeploymentApiPayload = ApiSchema['CreateDeploymentDto'];
export type DeploymentsListApiQuery =
  paths['/deployments']['get']['parameters']['query'];
export type DeploymentsListApiResult =
  paths['/deployments']['get']['responses']['200']['content']['application/json'];
