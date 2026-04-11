export type Config = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateConfigPayload = {
  key: string;
  value: string;
  isSecret?: boolean;
};

export type UpdateConfigPayload = Partial<CreateConfigPayload>;
