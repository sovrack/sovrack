-- Phase 4 schema migration
-- Changes:
--  1. Rename GitlabSourceType enum → AppSourceType
--  2. Drop Pipeline table (superseded by PipelineRun)
--  3. Change Environment.name from EnvName enum to TEXT
--  4. Replace ProjectService.buildStrategy (BuildStrategy) with buildPack (BuildPack)
--  5. Add new enums: ContainerStatus, ManagedServiceType, ManagedServiceStatus, ProxyCertType
--  6. Add new tables: Container, Volume, ProxyRule, ManagedService

-- ─── 1. Rename GitlabSourceType → AppSourceType ──────────────────────────────
ALTER TYPE "GitlabSourceType" RENAME TO "AppSourceType";

-- ─── 2. Drop Pipeline table ──────────────────────────────────────────────────
DROP TABLE IF EXISTS "Pipeline";

-- ─── 3. Change Environment.name from EnvName enum to TEXT ────────────────────
ALTER TABLE "Environment" ALTER COLUMN "name" TYPE TEXT USING "name"::text;

-- ─── 4. Replace buildStrategy with buildPack on ProjectService ────────────────
ALTER TABLE "ProjectService" ADD COLUMN "buildPack" "BuildPack" DEFAULT 'DOCKERFILE';
UPDATE "ProjectService" SET "buildPack" = ("buildStrategy"::text)::"BuildPack";
ALTER TABLE "ProjectService" ALTER COLUMN "buildPack" SET NOT NULL;
ALTER TABLE "ProjectService" DROP COLUMN "buildStrategy";
DROP TYPE "BuildStrategy";

-- ─── 5. New enum types ────────────────────────────────────────────────────────
CREATE TYPE "ContainerStatus" AS ENUM ('CREATED', 'RUNNING', 'PAUSED', 'RESTARTING', 'REMOVING', 'EXITED', 'DEAD');
CREATE TYPE "ManagedServiceType" AS ENUM ('POSTGRES', 'MYSQL', 'REDIS', 'MONGODB', 'RABBITMQ');
CREATE TYPE "ManagedServiceStatus" AS ENUM ('STOPPED', 'STARTING', 'RUNNING', 'STOPPING', 'ERROR');
CREATE TYPE "ProxyCertType" AS ENUM ('LETS_ENCRYPT', 'CUSTOM', 'SELF_SIGNED', 'NONE');

-- ─── 6. New tables ────────────────────────────────────────────────────────────

-- Container
CREATE TABLE "Container" (
    "id"           TEXT NOT NULL,
    "dockerId"     TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "imageRef"     TEXT NOT NULL,
    "status"       "ContainerStatus" NOT NULL DEFAULT 'CREATED',
    "deploymentId" TEXT,
    "serverId"     TEXT NOT NULL,
    "serviceId"    TEXT,
    "lastSeenAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Container_serverId_status_idx" ON "Container"("serverId", "status");
CREATE INDEX "Container_deploymentId_idx" ON "Container"("deploymentId");
CREATE INDEX "Container_dockerId_idx" ON "Container"("dockerId");
CREATE INDEX "Container_serviceId_idx" ON "Container"("serviceId");

ALTER TABLE "Container" ADD CONSTRAINT "Container_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Container" ADD CONSTRAINT "Container_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Volume
CREATE TABLE "Volume" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "mountPath"        TEXT,
    "sizeGb"           INTEGER,
    "serverId"         TEXT NOT NULL,
    "serviceId"        TEXT,
    "managedServiceId" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volume_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Volume_serverId_idx" ON "Volume"("serverId");
CREATE INDEX "Volume_serviceId_idx" ON "Volume"("serviceId");
CREATE INDEX "Volume_managedServiceId_idx" ON "Volume"("managedServiceId");

ALTER TABLE "Volume" ADD CONSTRAINT "Volume_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ManagedService (declared before ProxyRule since ProxyRule references it)
CREATE TABLE "ManagedService" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "type"          "ManagedServiceType" NOT NULL,
    "version"       TEXT NOT NULL DEFAULT 'latest',
    "port"          INTEGER NOT NULL,
    "credentials"   JSONB NOT NULL,
    "volumePath"    TEXT,
    "status"        "ManagedServiceStatus" NOT NULL DEFAULT 'STOPPED',
    "projectId"     TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "serverId"      TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedService_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagedService_projectId_idx" ON "ManagedService"("projectId");
CREATE INDEX "ManagedService_environmentId_idx" ON "ManagedService"("environmentId");
CREATE INDEX "ManagedService_serverId_status_idx" ON "ManagedService"("serverId", "status");

ALTER TABLE "ManagedService" ADD CONSTRAINT "ManagedService_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedService" ADD CONSTRAINT "ManagedService_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagedService" ADD CONSTRAINT "ManagedService_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wire Volume → ManagedService FK (now that ManagedService exists)
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_managedServiceId_fkey"
    FOREIGN KEY ("managedServiceId") REFERENCES "ManagedService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ProxyRule
CREATE TABLE "ProxyRule" (
    "id"               TEXT NOT NULL,
    "domain"           TEXT NOT NULL,
    "targetPort"       INTEGER NOT NULL,
    "sslEnabled"       BOOLEAN NOT NULL DEFAULT true,
    "certType"         "ProxyCertType" NOT NULL DEFAULT 'LETS_ENCRYPT',
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "serverId"         TEXT NOT NULL,
    "serviceId"        TEXT,
    "managedServiceId" TEXT,
    "environmentId"    TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxyRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProxyRule_serverId_domain_key" UNIQUE ("serverId", "domain")
);

CREATE INDEX "ProxyRule_serverId_idx" ON "ProxyRule"("serverId");
CREATE INDEX "ProxyRule_serviceId_idx" ON "ProxyRule"("serviceId");
CREATE INDEX "ProxyRule_environmentId_idx" ON "ProxyRule"("environmentId");

ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ProjectService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_managedServiceId_fkey"
    FOREIGN KEY ("managedServiceId") REFERENCES "ManagedService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_environmentId_fkey"
    FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
