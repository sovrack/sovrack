-- B4 (plan produit final) : le monitoring devient scopé PAR SERVEUR.
-- `monitoringInstalledAt` est posé quand la stack Prometheus/Grafana/Loki est
-- installée avec succès sur ce serveur ; les URLs se déduisent de Server.host.
ALTER TABLE "Server" ADD COLUMN IF NOT EXISTS "monitoringInstalledAt" TIMESTAMP(3);
