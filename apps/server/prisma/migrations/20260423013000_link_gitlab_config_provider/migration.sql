-- Link per-project GitLab configuration to a global Git provider.
ALTER TABLE "GitlabConfig"
ADD COLUMN "providerId" TEXT;

CREATE INDEX "GitlabConfig_providerId_idx" ON "GitlabConfig"("providerId");

ALTER TABLE "GitlabConfig"
ADD CONSTRAINT "GitlabConfig_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "GitProviderConfig"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
