-- CreateTable: GitProviderRepo
-- Junction table linking GitProviderConfig to specific repos
-- Used for per-repo webhook secrets (one secret per repo for isolation)
-- and to resolve webhook provider from incoming webhooks (Coolify/Dokploy pattern).

CREATE TABLE "GitProviderRepo" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalRepoId" TEXT,
    "externalRepoIdBig" BIGINT,
    "repoFullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "webhookSecret" TEXT,
    "webhookId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitProviderRepo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitProviderRepo_providerId_repoFullName_key" ON "GitProviderRepo"("providerId", "repoFullName");

-- CreateIndex
CREATE INDEX "GitProviderRepo_projectId_idx" ON "GitProviderRepo"("projectId");

-- CreateIndex
CREATE INDEX "GitProviderRepo_externalRepoId_idx" ON "GitProviderRepo"("externalRepoId");

-- CreateIndex
CREATE INDEX "GitProviderRepo_externalRepoIdBig_idx" ON "GitProviderRepo"("externalRepoIdBig");

-- AddForeignKey
ALTER TABLE "GitProviderRepo" ADD CONSTRAINT "GitProviderRepo_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "GitProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitProviderRepo" ADD CONSTRAINT "GitProviderRepo_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
