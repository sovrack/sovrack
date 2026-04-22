-- AlterTable
ALTER TABLE "public"."Deployment"
ADD COLUMN "gitlabPipelineId" BIGINT;

-- CreateIndex
CREATE INDEX "Deployment_gitlabPipelineId_idx"
ON "public"."Deployment"("gitlabPipelineId");

-- CreateIndex
CREATE INDEX "Deployment_projectId_environmentId_gitlabPipelineId_idx"
ON "public"."Deployment"("projectId", "environmentId", "gitlabPipelineId");
