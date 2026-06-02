DO $$ BEGIN
  ALTER TYPE "EnvName" ADD VALUE 'TESTING';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "EnvName" ADD VALUE 'PREVIEW';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "ProjectServiceType" AS ENUM ('FRONTEND', 'BACKEND', 'WORKER', 'DATABASE', 'STATIC', 'API', 'OTHER');
CREATE TYPE "BuildStrategy" AS ENUM ('DOCKERFILE', 'DOCKER_COMPOSE', 'BUILDPACK', 'STATIC', 'NONE');
CREATE TYPE "ServiceDeploymentMode" AS ENUM ('DOCKER', 'DOCKER_COMPOSE');
CREATE TYPE "DnsProviderType" AS ENUM ('CLOUDFLARE', 'DIGITALOCEAN', 'OVH', 'MANUAL');
CREATE TYPE "DnsRecordType" AS ENUM ('A', 'CNAME', 'TXT');

CREATE TABLE "ProjectService" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ProjectServiceType" NOT NULL DEFAULT 'OTHER',
  "sourceProviderId" TEXT,
  "gitlabProjectId" BIGINT,
  "repositoryPath" TEXT,
  "defaultBranch" TEXT NOT NULL DEFAULT 'main',
  "buildStrategy" "BuildStrategy" NOT NULL DEFAULT 'DOCKERFILE',
  "dockerfilePath" TEXT NOT NULL DEFAULT 'Dockerfile',
  "composeServiceName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvironmentServiceTarget" (
  "id" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "deploymentMode" "ServiceDeploymentMode" NOT NULL DEFAULT 'DOCKER_COMPOSE',
  "port" INTEGER,
  "domain" TEXT,
  "healthcheckPath" TEXT,
  "replicas" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnvironmentServiceTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DnsProvider" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "DnsProviderType" NOT NULL DEFAULT 'MANUAL',
  "apiToken" TEXT,
  "accountId" TEXT,
  "zoneId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DnsProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Domain" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerId" TEXT,
  "projectId" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DnsRecord" (
  "id" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  "type" "DnsRecordType" NOT NULL,
  "name" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "ttl" INTEGER NOT NULL DEFAULT 300,
  "proxied" BOOLEAN,
  "serviceId" TEXT,
  "environmentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DnsRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Pipeline" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "Deployment" ADD COLUMN "serviceId" TEXT;

CREATE UNIQUE INDEX "ProjectService_projectId_name_key" ON "ProjectService"("projectId", "name");
CREATE INDEX "ProjectService_projectId_idx" ON "ProjectService"("projectId");
CREATE INDEX "ProjectService_sourceProviderId_idx" ON "ProjectService"("sourceProviderId");
CREATE INDEX "ProjectService_gitlabProjectId_idx" ON "ProjectService"("gitlabProjectId");

CREATE UNIQUE INDEX "EnvironmentServiceTarget_environmentId_serviceId_serverId_key" ON "EnvironmentServiceTarget"("environmentId", "serviceId", "serverId");
CREATE INDEX "EnvironmentServiceTarget_environmentId_idx" ON "EnvironmentServiceTarget"("environmentId");
CREATE INDEX "EnvironmentServiceTarget_serviceId_idx" ON "EnvironmentServiceTarget"("serviceId");
CREATE INDEX "EnvironmentServiceTarget_serverId_idx" ON "EnvironmentServiceTarget"("serverId");

CREATE INDEX "Pipeline_serviceId_idx" ON "Pipeline"("serviceId");
CREATE INDEX "Deployment_serviceId_idx" ON "Deployment"("serviceId");

CREATE UNIQUE INDEX "DnsProvider_type_name_key" ON "DnsProvider"("type", "name");
CREATE UNIQUE INDEX "Domain_projectId_name_key" ON "Domain"("projectId", "name");
CREATE INDEX "Domain_providerId_idx" ON "Domain"("providerId");
CREATE INDEX "Domain_projectId_idx" ON "Domain"("projectId");
CREATE UNIQUE INDEX "DnsRecord_domainId_type_name_key" ON "DnsRecord"("domainId", "type", "name");
CREATE INDEX "DnsRecord_serviceId_idx" ON "DnsRecord"("serviceId");
CREATE INDEX "DnsRecord_environmentId_idx" ON "DnsRecord"("environmentId");

ALTER TABLE "ProjectService" ADD CONSTRAINT "ProjectService_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectService" ADD CONSTRAINT "ProjectService_sourceProviderId_fkey" FOREIGN KEY ("sourceProviderId") REFERENCES "GitProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnvironmentServiceTarget" ADD CONSTRAINT "EnvironmentServiceTarget_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvironmentServiceTarget" ADD CONSTRAINT "EnvironmentServiceTarget_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnvironmentServiceTarget" ADD CONSTRAINT "EnvironmentServiceTarget_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Domain" ADD CONSTRAINT "Domain_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "DnsProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
