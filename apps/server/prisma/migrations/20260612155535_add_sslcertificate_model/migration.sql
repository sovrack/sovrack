-- CreateTable
CREATE TABLE "SslCertificate" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "domainName" TEXT NOT NULL,
    "certificatePath" TEXT NOT NULL,
    "keyPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT true,
    "lastRenewalAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SslCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SslCertificate_domainId_key" ON "SslCertificate"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "SslCertificate_domainName_key" ON "SslCertificate"("domainName");

-- CreateIndex
CREATE INDEX "SslCertificate_autoRenewal_expiresAt_idx" ON "SslCertificate"("autoRenewal", "expiresAt");

-- AddForeignKey
ALTER TABLE "SslCertificate" ADD CONSTRAINT "SslCertificate_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
