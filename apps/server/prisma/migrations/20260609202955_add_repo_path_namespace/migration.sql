-- Provider-agnostic clone identity (Dokploy model): store the repository PATH
-- ("group/project" / "owner/repo") so git clone never relies on the numeric ID.
ALTER TABLE "GitlabConfig" ADD COLUMN "repoPathNamespace" TEXT;
