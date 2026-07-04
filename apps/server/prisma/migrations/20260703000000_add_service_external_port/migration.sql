-- Task 4 ("Sécurité database + UI" mission): host port to publish for a
-- DATABASE service's external access. Null = not exposed externally (the
-- default) — enforced at deploy time in DockerDeployExecutorService.

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "externalPort" INTEGER;
