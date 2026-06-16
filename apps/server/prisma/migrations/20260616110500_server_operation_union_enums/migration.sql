-- CreateEnum
CREATE TYPE "ServerOperationTargetStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'TIMEOUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "ServerOperationStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- Move Step + Target columns onto their OWN enums BEFORE dropping the shared one
-- (0 rows → safe). Removes their dependency on "ServerOperationStatus" so the enum
-- swap below can DROP the old type without a "depends on" error.
ALTER TABLE "ServerOperationStep" DROP COLUMN "status",
ADD COLUMN     "status" "ServerOperationStepStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "ServerOperationTarget" DROP COLUMN "status",
ADD COLUMN     "status" "ServerOperationTargetStatus" NOT NULL DEFAULT 'PENDING';

-- AlterEnum: now only ServerOperation.status references "ServerOperationStatus"
BEGIN;
CREATE TYPE "ServerOperationStatus_new" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELED', 'TIMEOUT');
ALTER TABLE "ServerOperation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ServerOperation" ALTER COLUMN "status" TYPE "ServerOperationStatus_new" USING ("status"::text::"ServerOperationStatus_new");
ALTER TYPE "ServerOperationStatus" RENAME TO "ServerOperationStatus_old";
ALTER TYPE "ServerOperationStatus_new" RENAME TO "ServerOperationStatus";
DROP TYPE "ServerOperationStatus_old";
ALTER TABLE "ServerOperation" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
COMMIT;
