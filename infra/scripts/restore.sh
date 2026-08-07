#!/usr/bin/env bash
# =============================================================================
# Sovrack — Restore d'un dump PostgreSQL
# -----------------------------------------------------------------------------
# Usage : ./scripts/restore.sh /chemin/backup.sql.gz
#   - destructure : ré-importe dans la base existante. DATA DESTRUCTIVE.
#   - C'est une opération DANGEREUSE — à lancer hors toute activité.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

DUMP="${1:-}"
[ -n "$DUMP" ] || { echo "Usage: $0 <backup.sql[.gz]>"; exit 1; }
[ -f "$DUMP" ] || { echo "❌ Fichier introuvable : $DUMP"; exit 1; }

# Lis les variables depuis le compose
POSTGRES_USER="$(docker compose --env-file .env exec -T postgres printenv POSTGRES_USER 2>/dev/null || echo da_admin)"
POSTGRES_DB="$(docker compose --env-file .env exec -T postgres printenv POSTGRES_DB 2>/dev/null || echo deploy_automation)"

echo "⚠️  Tu vas RESTAURER dans '$POSTGRES_DB' (utilisateur '$POSTGRES_USER')."
read -r -p "Confirmer (yes) ? " ans
[ "$ans" = "yes" ] || { echo "Abandon."; exit 1; }

case "$DUMP" in
  *.gz)  gzip -dc "$DUMP" ; echo ... ;;
  *)     cat "$DUMP" ;;
esac | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "✅ Restauration terminée."