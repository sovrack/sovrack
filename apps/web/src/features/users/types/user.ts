import type { components } from "@/generated/api-contract";

type ApiSchema = components["schemas"];

export type ChangeMyPasswordPayload = ApiSchema["ChangeMyPasswordDto"];
