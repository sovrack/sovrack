import type { DeploymentStatus } from "./deployment";
import type { DeploymentLogEvent } from "./logs";

export type DeploymentStartedEvent = {
  deploymentId: string;
  status?: DeploymentStatus;
};

export type DeploymentStatusEvent = {
  deploymentId: string;
  status: DeploymentStatus;
};

export type DeploymentFinishedEvent = {
  deploymentId: string;
  status: DeploymentStatus;
  finishedAt?: string;
};

export type DeploymentJoinedEvent = {
  deploymentId: string;
};

export type DeploymentErrorEvent = {
  deploymentId?: string;
  message: string;
};

export type SocketDeploymentEvent =
  | { type: "deployment:started"; payload: DeploymentStartedEvent }
  | { type: "deployment:log"; payload: DeploymentLogEvent }
  | { type: "deployment:status"; payload: DeploymentStatusEvent }
  | { type: "deployment:finished"; payload: DeploymentFinishedEvent }
  | { type: "deployment:joined"; payload: DeploymentJoinedEvent };
