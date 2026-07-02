export type EnvOrigin = "service" | "environment" | "serviceEnvironment";

export type EnvPreviewVariable = {
  key: string;
  origin: EnvOrigin;
  isSecret: boolean;
  /** Real value for non-secrets; '[REDACTED]' for secrets. */
  value: string;
};

export type EnvPreview = {
  variables: EnvPreviewVariable[];
  warnings: string[];
};
