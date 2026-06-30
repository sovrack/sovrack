import type { components } from "@/generated/api-contract";

type ApiSchema = components["schemas"];

// Response shape stays manual (no SshKeyResponseDto in the contract).
export type SshKey = {
  id: string;
  name: string;
  publicKey: string;
  keyType: string;
  createdAt: string;
};

// Request payload derived from the backend contract.
export type CreateSshKeyPayload = ApiSchema["CreateSshKeyDto"];
