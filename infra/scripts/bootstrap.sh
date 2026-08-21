#!/usr/bin/env bash
# =============================================================================
# Sovrack — Bootstrap (initialisation 1ère fois sur le VPS)
# -----------------------------------------------------------------------------
# - Crée les répertoires de données persistants.
# - Vérifie docker & docker compose.
# - Copie .env.production.example → .env si absent (l'utilisateur renseignera).
# =============================================================================
set -euo pipefail

# Chemins
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DEPLOY_DATA_DIR:-/srv/sovrack/data}"
PG_DIR="$DATA_DIR/pg"
REDIS_DIR="$DATA_DIR/redis"
BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$ROOT/backups}"

echo "▶️  Bootstrap Sovrack infra"
echo "    Racine : $ROOT"
echo "    Données: $DATA_DIR"

# 1. Vérifier docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker est introuvable. Installe-le (voir docs)."
  exit 1
fi
docker info >/dev/null 2>&1 || {
  echo "❌ Le daemon docker ne répond pas (ou droits manquants)."
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "❌ docker compose (v2) requis."
  exit 1
}

# 2. Créer les dossiers persistants
mkdir -p "$PG_DIR" "$REDIS_DIR" "$BACKUP_DIR"
chmod 700 "$REDIS_DIR" 2>/dev/null || true
chmod 700 "$PG_DIR" 2>/dev/null || true

# 3. .env
if [ ! -f "$ROOT/.env" ]; then
  if [ -f "$ROOT/.env.production.example" ]; then
    cp "$ROOT/.env.production.example" "$ROOT/.env"
    chmod 600 "$ROOT/.env"
    echo "ℹ️  .env créé depuis le template. ➜ Renseigne les secrets : $ROOT/.env"
    echo "   Puis relance ./scripts/deploy.sh"
  else
    echo "❌ .env absent et modèle absent."
    exit 1
  fi
else
  chmod 600 "$ROOT/.env"
  echo "✅ .env existant."
fi

# 4. Vérifier que les secrets ne sont pas restés par défaut
if grep -qs "change_me_" "$ROOT/.env"; then
  echo "⚠️  Avertissement : des secrets par défaut ('change_me_*') sont encore présents."
fi

echo "✅ Bootstrap terminé. Édite .env puis : ./scripts/deploy.sh"
