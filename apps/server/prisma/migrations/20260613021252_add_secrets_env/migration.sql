-- AlterTable
ALTER TABLE "Environment" ADD COLUMN     "secretsEnv" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "secretsEnv" TEXT;

-- AlterTable
ALTER TABLE "ServiceEnvironment" ADD COLUMN     "secretsEnv" TEXT;
