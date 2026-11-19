import type { components } from "@/generated/api-contract";

type ApiSchema = components["schemas"];
type DeploymentApi = ApiSchema["DeploymentDetailedResponseDto"];
type DeploymentMutationApi = ApiSchema["DeploymentResponseDto"];
type CreateDeploymentApiPayload = ApiSchema["CreateDeploymentDto"];

export type DeploymentServiceTarget = {
  id: string;
  serviceId: string | null;
  port: number | null;
  domain: string | null;
  server: { id: string; name: string; host: string };
};

export type DeploymentServiceSummary = {
  id: string;
  name: string;
  type: string | null;
};

export type Deployment = DeploymentApi & {
  serviceId?: string | null;
  serviceEnvId?: string | null;
  publicUrl?: string | null;
  service?: DeploymentServiceSummary | null;
  environment?: DeploymentApi["environment"] & {
    serviceTargets?: DeploymentServiceTarget[];
  };
  // Conteneur(s) RUNNING attaché(s) — non vide = ce déploiement SERT réellement
  // (« Live » réel), vs un SUCCESS historique superséd​é. Renseigné par l'API liste.
  containers?: { id: string }[];
};

export type DeploymentMutation = DeploymentMutationApi;
export type DeploymentStatus = Deployment["status"];
export type DeploymentStrategy = "standard" | "blue-green";

export type BuildSource =
  | "DOCKERFILE_REGISTRY"
  | "DOCKERFILE_LOCAL"
  | "NIXPACKS_REGISTRY"
  | "NIXPACKS_LOCAL"
  | "DOCKER_COMPOSE"
  | "STATIC"
  | "EXTERNAL_IMAGE";

export type CreateDeploymentPayload = CreateDeploymentApiPayload & {
  serviceEnvId?: string;
  strategy?: DeploymentStrategy;
  buildSource?: BuildSource;
  overrideImage?: string;
};
