import type { components } from "@/generated/api-contract";
import type { ServiceLink } from "./service-environment";

type ApiSchema = components["schemas"];

export type EnvName = "STAGING" | "PRODUCTION" | "TESTING" | "PREVIEW";

// NOTE: the backend exposes no EnvironmentResponseDto in the OpenAPI contract,
// so the response shape stays hand-written. Only the request payloads below are
// derived from the contract (request side stays in sync with the backend).
export type Environment = {
  id: string;
  name: EnvName;
  projectId: string;
  env: string | null;
  serviceLinks?: ServiceLink[];
  servers?: { id: string; name: string; host: string }[];
  createdAt: string;
  updatedAt: string;
};

// Derived from the backend contract (openapi-typescript).
export type CreateEnvironmentPayload = ApiSchema["CreateEnvironmentDto"];
export type UpdateEnvironmentPayload = ApiSchema["UpdateEnvironmentDto"];
