-- AlterTable
ALTER TABLE "ServiceEnvironment" ADD COLUMN     "currentDeploymentId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceEnvironment_currentDeploymentId_idx" ON "ServiceEnvironment"("currentDeploymentId");

-- AddForeignKey
ALTER TABLE "ServiceEnvironment" ADD CONSTRAINT "ServiceEnvironment_currentDeploymentId_fkey" FOREIGN KEY ("currentDeploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
