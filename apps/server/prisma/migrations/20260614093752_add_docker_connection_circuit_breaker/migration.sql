-- AlterTable
ALTER TABLE "DockerConnection" ADD COLUMN     "circuitOpenedAt" TIMESTAMP(3),
ADD COLUMN     "circuitState" TEXT NOT NULL DEFAULT 'CLOSED',
ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;
