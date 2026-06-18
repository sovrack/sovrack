-- Phase 1.3 — Breaking migration
-- Supprime les vieux modèles (Config, EnvironmentConfig, ProjectService,
-- EnvironmentServiceTarget, ManagedService, GitlabConfig) et les enums
-- obsolètes après migration vers le modèle Service unifié.

-- DropForeignKey (GitlabConfig — supprimé)
ALTER TABLE IF EXISTS "GitlabConfig" DROP CONSTRAINT IF EXISTS "GitlabConfig_projectId_fkey";
ALTER TABLE IF EXISTS "GitlabConfig" DROP CONSTRAINT IF EXISTS "GitlabConfig_providerId_fkey";

-- DropIndex (Volume — managedServiceId supprimé)
DROP INDEX IF EXISTS "Volume_managedServiceId_idx";

-- AlterTable: Environment — colonnes supprimées (déjà migrées vers env JSON)
ALTER TABLE "Environment" DROP COLUMN IF EXISTS "autoDeploy",
DROP COLUMN IF EXISTS "autoDeployBranch",
DROP COLUMN IF EXISTS "domain",
DROP COLUMN IF EXISTS "isActive",
DROP COLUMN IF EXISTS "serverId";

-- AlterTable: Project — colonnes build/source supprimées (déjà migrées vers Service)
ALTER TABLE "Project" DROP COLUMN IF EXISTS "branch",
DROP COLUMN IF EXISTS "buildPort",
DROP COLUMN IF EXISTS "buildStartCmd",
DROP COLUMN IF EXISTS "defaultBuildSource",
DROP COLUMN IF EXISTS "dockerComposeContent",
DROP COLUMN IF EXISTS "dockerfile",
DROP COLUMN IF EXISTS "dockerfileContent",
DROP COLUMN IF EXISTS "gitlabCiContent",
DROP COLUMN IF EXISTS "gitlabId",
DROP COLUMN IF EXISTS "gitlabUrl",
DROP COLUMN IF EXISTS "nixpacksConfig",
DROP COLUMN IF EXISTS "port",
DROP COLUMN IF EXISTS "projectType",
DROP COLUMN IF EXISTS "staticConfig";

-- AlterTable: ProxyRule — managedServiceId supprimé
ALTER TABLE "ProxyRule" DROP COLUMN IF EXISTS "managedServiceId";

-- AlterTable: Volume — managedServiceId supprimé
ALTER TABLE "Volume" DROP COLUMN IF EXISTS "managedServiceId";

-- DropTable: vieux modèles supprimés
DROP TABLE IF EXISTS "Config";
DROP TABLE IF EXISTS "EnvironmentConfig";
DROP TABLE IF EXISTS "EnvironmentServiceTarget";
DROP TABLE IF EXISTS "GitlabConfig";
DROP TABLE IF EXISTS "ManagedService";
DROP TABLE IF EXISTS "ProjectService" CASCADE;

-- DropEnum: vieux enums supprimés
DROP TYPE IF EXISTS "AppSourceType";
DROP TYPE IF EXISTS "ManagedServiceStatus";
DROP TYPE IF EXISTS "ProjectServiceType";
DROP TYPE IF EXISTS "ServiceDeploymentMode";

-- AddForeignKey: nouvelle FK Deployment → Service
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK Build → Service
ALTER TABLE "Build" ADD CONSTRAINT "Build_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK Container → Service
ALTER TABLE "Container" ADD CONSTRAINT "Container_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK Volume → Service
ALTER TABLE "Volume" ADD CONSTRAINT "Volume_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK ProxyRule → Service
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK DnsRecord → Service
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK WebhookEndpoint → Service
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: nouvelle FK PipelineRun → Service
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
