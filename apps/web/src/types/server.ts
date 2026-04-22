import type {
  CreateServerApiPayload,
  CreateServerApiResult,
  InstallServerKeyApiPayload,
  InstallServerKeyApiResult,
  InstallToolsApiPayload,
  RegisterRunnerApiPayload,
  ServerApi,
  ServerJobApi,
  UpdateServerApiPayload,
} from './api-contract';

export type Server = ServerApi & {
  description?: string;
};
export type ServerJob = ServerJobApi;
export type CreateServerPayload = CreateServerApiPayload & {
  description?: string;
  sshKeyId?: string;
};
export type CreateServerResult = CreateServerApiResult;
export type UpdateServerPayload = UpdateServerApiPayload & {
  description?: string;
};
export type InstallToolsPayload = InstallToolsApiPayload;
export type RegisterRunnerPayload = RegisterRunnerApiPayload;
export type InstallServerKeyPayload = InstallServerKeyApiPayload;
export type InstallServerKeyResult = InstallServerKeyApiResult;

export type ServerVerificationMode = NonNullable<
  CreateServerApiPayload['verificationMode']
>;
export type ServerConnectionMode = Server['connectionMode'];
export type ServerJobStatus = ServerJob['status'];
export type ServerJobType = ServerJob['type'];

export type VerifyServerResult = Server;
