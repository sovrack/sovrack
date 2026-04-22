-- AlterTable
ALTER TABLE "public"."Deployment" ADD COLUMN     "previousDeploymentId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Deployment" ADD CONSTRAINT "Deployment_previousDeploymentId_fkey" FOREIGN KEY ("previousDeploymentId") REFERENCES "public"."Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
