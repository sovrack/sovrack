-- CreateEnum
CREATE TYPE "DeploymentStrategy" AS ENUM ('STANDARD', 'BLUE_GREEN');

-- CreateEnum
CREATE TYPE "BuildMode" AS ENUM ('REGISTRY', 'LOCAL');

-- AlterTable
ALTER TABLE "Deployment" ADD COLUMN "strategy" "DeploymentStrategy" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "buildMode" "BuildMode" NOT NULL DEFAULT 'REGISTRY';
