-- AlterTable
ALTER TABLE "public"."GitlabConfig" ADD COLUMN     "deployTokenUsername" TEXT,
ADD COLUMN     "deployTokenValue" TEXT,
ADD COLUMN     "registryUrl" TEXT,
ADD COLUMN     "webhookSecret" TEXT;
