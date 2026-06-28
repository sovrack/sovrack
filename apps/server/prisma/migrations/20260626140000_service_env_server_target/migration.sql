-- Découplage serveur↔environnement : cible de déploiement par service-env.
-- ADD COLUMN nullable + FK SET NULL = data-preserving (aucun backfill : les
-- service-envs existants gardent serverId NULL → fallback sur le 1er serveur
-- de l'environnement, comportement historique inchangé).
ALTER TABLE "ServiceEnvironment" ADD COLUMN "serverId" TEXT;
ALTER TABLE "ServiceEnvironment"
  ADD CONSTRAINT "ServiceEnvironment_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ServiceEnvironment_serverId_idx" ON "ServiceEnvironment"("serverId");
