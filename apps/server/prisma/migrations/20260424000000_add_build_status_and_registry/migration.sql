-- Add BuildStatus enum
CREATE TYPE "BuildStatus" AS ENUM ('NOT_BUILT', 'BUILDING', 'SUCCESS', 'FAILED');

-- Add RegistryProviderType enum
CREATE TYPE "RegistryProviderType" AS ENUM ('DOCKER_HUB', 'DOCKER_REGISTRY', 'ECR', 'GCR');

-- Add build-related columns to Deployment
ALTER TABLE "Deployment"
ADD COLUMN "buildStatus" "BuildStatus" NOT NULL DEFAULT 'NOT_BUILT',
ADD COLUMN "buildLog" TEXT;

-- Create RegistryConfig table
CREATE TABLE "RegistryConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" "RegistryProviderType" NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "registryUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "connectionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create indexes for RegistryConfig
CREATE INDEX "RegistryConfig_type_isDefault_idx" ON "RegistryConfig"("type", "isDefault");
CREATE UNIQUE INDEX "RegistryConfig_type_name_key" ON "RegistryConfig"("type", "name");
