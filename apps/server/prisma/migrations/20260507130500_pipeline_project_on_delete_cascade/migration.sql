-- DropForeignKey
ALTER TABLE "public"."Pipeline" DROP CONSTRAINT "Pipeline_projectId_fkey";

-- AddForeignKey
ALTER TABLE "public"."Pipeline"
ADD CONSTRAINT "Pipeline_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
