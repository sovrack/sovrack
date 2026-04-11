export type PlatformConfigItem = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UpdatePlatformConfigPayload = {
  value: string;
  isSecret?: boolean;
};

export type GitlabTestResult = {
  ok: boolean;
  message: string;
};
