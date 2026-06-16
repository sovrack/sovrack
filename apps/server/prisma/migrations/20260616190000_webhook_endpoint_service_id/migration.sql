-- Webhook PAR SERVICE : clé service-level sur WebhookEndpoint (additif).
ALTER TABLE "WebhookEndpoint" ADD COLUMN "serviceId" TEXT;
CREATE INDEX "WebhookEndpoint_serviceId_idx" ON "WebhookEndpoint"("serviceId");
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
