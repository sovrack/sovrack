-- Add GITLAB value to RegistryProviderType enum
-- Migrate existing DOCKER_REGISTRY entries with GitLab names to GITLAB type

ALTER TYPE "RegistryProviderType" ADD VALUE IF NOT EXISTS 'GITLAB';
