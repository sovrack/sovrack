-- Réconciliation : colonnes ajoutées en cours de session via ALTER direct
-- (drift) → matérialisées en migration pour les bases neuves (CI + prod).

-- AlterTable
ALTER TABLE "RegistryConfig" ADD COLUMN     "providerId" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "buildMode" TEXT DEFAULT 'LOCAL',
ADD COLUMN     "deployTrigger" TEXT DEFAULT 'PIPELINE_SUCCESS',
ADD COLUMN     "registryImage" TEXT;

-- AlterTable
ALTER TABLE "WebhookEndpoint" ADD COLUMN     "secret" TEXT;

-- CreateIndex
CREATE INDEX "RegistryConfig_providerId_idx" ON "RegistryConfig"("providerId");
