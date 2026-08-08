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

export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

echo "▶️  Sovrack deploy — $(date)"
[ -f .env ] || { echo "❌ .env introuvable. Lance ./scripts/bootstrap.sh d'abord."; exit 1; }

# ── Sécurité : refuse d'uniquement un .env avec des secrets par défaut ────────
# Empêche la copie accidentelle de .env.production.example (change_me_*) ou de
# valeurs de dev (Dev_Test_Only_1192) de partir en production. Le seed-staff
# est idempotent : un ROOT créé avec un mot de passe par défaut ne sera JAMAIS
# re-corrigé ensuite, donc on échoue dès le départ.
LEAKED_PLACEHOLDERS=$(grep -nE '(change_me_|CHANGE_ME_|Dev_Test_Only_1192)' .env || true)
if [ -n "$LEAKED_PLACEHOLDERS" ]; then
  echo "❌ .env contient des secrets par défaut/placeholder. Correction obligatoire avant déploiement :"
  echo "$LEAKED_PLACEHOLDERS"
  exit 1
fi

# Pull les images (auto utilise les images référencées)
docker compose --env-file .env pull

# Plan + up (recompute uniquement si nécessaire)
docker compose --env-file .env up -d --remove-orphans

# Log d'état court
docker compose --env-file .env ps

echo "✅ Stack démarrée. Vérifie : docker compose ps ; docker compose logs -f backend"