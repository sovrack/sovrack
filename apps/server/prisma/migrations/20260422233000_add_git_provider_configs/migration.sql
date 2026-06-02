-- CreateEnum
CREATE TYPE "public"."GitProviderType" AS ENUM ('GITLAB');

-- CreateTable
CREATE TABLE "public"."GitProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."GitProviderType" NOT NULL DEFAULT 'GITLAB',
    "gitlabUrl" TEXT NOT NULL,
    "internalUrl" TEXT,
    "redirectUri" TEXT,
    "applicationId" TEXT,
    "applicationSecret" TEXT,
    "groupNames" TEXT,
    "adminToken" TEXT,
    "oauthAccessToken" TEXT,
    "oauthRefreshToken" TEXT,
    "oauthExpiresAt" TIMESTAMP(3),
    "oauthState" TEXT,
    "oauthStateExpiresAt" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitProviderConfig_type_isDefault_idx" ON "public"."GitProviderConfig"("type", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "GitProviderConfig_type_name_key" ON "public"."GitProviderConfig"("type", "name");
