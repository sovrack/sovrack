-- CreateTable
CREATE TABLE "SshKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "keyType" TEXT NOT NULL DEFAULT 'ed25519',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SshKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SshKey_userId_idx" ON "SshKey"("userId");

-- AddForeignKey
ALTER TABLE "SshKey" ADD CONSTRAINT "SshKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
