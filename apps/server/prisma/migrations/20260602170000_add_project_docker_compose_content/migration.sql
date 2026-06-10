-- Add dockerComposeContent to Project (extracted from GitLab repo or provided manually).
-- This column was added to the Prisma schema but no migration was created,
-- causing runtime errors in GitlabPollingService.

ALTER TABLE "Project" ADD COLUMN "dockerComposeContent" TEXT;
