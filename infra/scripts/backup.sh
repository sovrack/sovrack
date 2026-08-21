#!/usr/bin/env bash
# =============================================================================
# Sovrack — Backup PostgreSQL (dump compressé + rotation)
# -----------------------------------------------------------------------------
# Usage : ./scripts/backup.sh            → backup manuel
# Cron recommandé sur le VPS :
#   30 2 * * * /srv/sovrack/scripts/backup.sh >> /var/log/sovrack-backup.log 2>&1
# =============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

[ -f .env ] || { echo "❌ .env introuvable. Lance ./scripts/bootstrap.sh."; exit 1; }

# Récupère les identifiants depuis le compose (résolution des valeurs .env)
read -r P_USER <<<"$(docker compose --env-file .env config --format json 2>/dev/null | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['services']['postgres']['environment']['POSTGRES_USER'])" 2>/dev/null || echo da_admin)"
read -r P_DB <<<"$(docker compose --env-file .env config --format json 2>/dev/null | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['services']['postgres']['environment']['POSTGRES_DB'])" 2>/dev/null || echo deploy_automation)"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/sovrack-$STAMP.sql.gz"

echo "▶️ Backup PostgreSQL → $DEST"
if docker compose --env-file .env exec -T postgres \
     pg_dump -U "$P_USER" -d "$P_DB" | gzip > "$DEST"; then
  gzip -t "$DEST"
  sha256sum "$DEST" > "$DEST.sha256"
  echo "✅ Backup OK : $DEST"
else
  echo "❌ Backup échoué"; rm -f "$DEST"; exit 1
fi

# Rotation : ne garde que les N derniers. Une restauration crée d'abord une
# sauvegarde de sécurité avec SKIP_BACKUP_ROTATION=true afin de ne jamais
# supprimer par mégarde le dump source avant son import.
RETENTION="${BACKUP_RETENTION:-7}"
if [ "${SKIP_BACKUP_ROTATION:-false}" = "true" ]; then
  echo "ℹ️  Rotation ignorée pour cette sauvegarde de sécurité."
else
  [[ "$RETENTION" =~ ^[1-9][0-9]*$ ]] || {
    echo "❌ BACKUP_RETENTION doit être un entier strictement positif."
    exit 1
  }
  echo "ℹ️  Conservation des $RETENTION derniers backups."
  find "$BACKUP_DIR" -maxdepth 1 -name 'sovrack-*.sql.gz' -type f \
    | sort -r | tail -n +$((RETENTION+1)) | while read -r old_backup; do
        rm -- "$old_backup"
        rm -f -- "$old_backup.sha256"
      done
fi
echo "🏁 Terminé."
