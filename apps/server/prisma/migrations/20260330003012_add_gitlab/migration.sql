-- CreateEnum
CREATE TYPE "public"."PipelineStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "gitlabId" INTEGER;

-- CreateTable
CREATE TABLE "public"."GitlabConfig" (
    "id" TEXT NOT NULL,
    "gitlabUrl" TEXT NOT NULL,
    "gitlabToken" TEXT NOT NULL,
    "gitlabId" INTEGER NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitlabConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pipeline" (
    "id" TEXT NOT NULL,
    "gitlabId" INTEGER NOT NULL,
    "status" "public"."PipelineStatus" NOT NULL,
    "ref" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitlabConfig_projectId_key" ON "public"."GitlabConfig"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_projectId_gitlabId_key" ON "public"."Pipeline"("projectId", "gitlabId");

-- AddForeignKey
ALTER TABLE "public"."GitlabConfig" ADD CONSTRAINT "GitlabConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pipeline" ADD CONSTRAINT "Pipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
