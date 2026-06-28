-- Drop denormalized Server.hasDocker / hasRunner columns.
-- Source of truth is now the `capabilities` JSON map (keys docker.installed /
-- gitlab_runner.installed), read via serverHasDocker/serverHasRunner. Detection
-- already populates capabilities, so no data is lost.
ALTER TABLE "Server" DROP COLUMN "hasDocker";
ALTER TABLE "Server" DROP COLUMN "hasRunner";
