-- CreateTable
CREATE TABLE "DockerConnection" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "tlsCaCert" TEXT NOT NULL,
    "tlsClientCert" TEXT NOT NULL,
    "tlsClientKey" TEXT NOT NULL,
    "apiVersion" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "isReachable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DockerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DockerConnection_serverId_key" ON "DockerConnection"("serverId");

-- CreateIndex
CREATE INDEX "DockerConnection_isReachable_idx" ON "DockerConnection"("isReachable");

-- AddForeignKey
ALTER TABLE "DockerConnection" ADD CONSTRAINT "DockerConnection_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
