-- P5: link ProxyRule to Domain by a real foreign key (was a bare hostname string).
-- Nullable + ON DELETE CASCADE so deleting a Domain removes its proxy rule; the
-- unique index enforces one ProxyRule per Domain.

-- AlterTable
ALTER TABLE "ProxyRule" ADD COLUMN "domainId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProxyRule_domainId_key" ON "ProxyRule"("domainId");

-- AddForeignKey
ALTER TABLE "ProxyRule" ADD CONSTRAINT "ProxyRule_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
