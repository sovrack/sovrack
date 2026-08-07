#!/usr/bin/env bash
# =============================================================================
# Sovrack — Déploiement de la stack de production
# -----------------------------------------------------------------------------
# Pull les dernières images du registry + (re)crée les services.
# Utilisé par la CI ou à la main sur le VPS.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▶️  Sovrack deploy — $(date)"
[ -f .env ] || { echo "❌ .env introuvable. Lance ./scripts/bootstrap.sh d'abord."; exit 1; }

# Pull les images (auto utilise les images référencées)
docker compose --env-file .env pull

# Plan + up (recompute uniquement si nécessaire)
docker compose --env-file .env up -d --remove-orphans

# Log d'état court
docker compose --env-file .env ps

echo "✅ Stack démarrée. Vérifie : docker compose ps ; docker compose logs -f backend"