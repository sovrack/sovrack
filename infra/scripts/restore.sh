#!/usr/bin/env bash
# =============================================================================
# Sovrack — restauration contrôlée d'un dump PostgreSQL
# -----------------------------------------------------------------------------
# Usage : ./scripts/restore.sh /chemin/backup.sql.gz [--allow-unverified]
#
# La base cible est recréée vide avant l'import. En cas d'échec, les services
# applicatifs restent arrêtés : redémarrer sur une base partiellement restaurée
# serait plus dangereux qu'une indisponibilité explicite.
# =============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"
export ENV_FILE="${ENV_FILE:-.env}"

DUMP="${1:-}"
ALLOW_UNVERIFIED="${2:-}"
[ -n "$DUMP" ] || {
  echo "Usage: $0 <backup.sql[.gz]> [--allow-unverified]"
  exit 1
}
[ -f "$DUMP" ] || { echo "❌ Fichier introuvable : $DUMP"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "❌ $ENV_FILE introuvable."; exit 1; }
if [ -n "$ALLOW_UNVERIFIED" ] && [ "$ALLOW_UNVERIFIED" != "--allow-unverified" ]; then
  echo "❌ Option inconnue : $ALLOW_UNVERIFIED"
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" "$@"
}

if [[ "$DUMP" == *.gz ]]; then
  gzip -t "$DUMP"
fi
if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP.sha256")")
elif [ "$ALLOW_UNVERIFIED" != "--allow-unverified" ]; then
  echo "❌ Checksum absent : $DUMP.sha256"
  echo "   Utilise --allow-unverified uniquement pour un ancien dump vérifié autrement."
  exit 1
else
  echo "⚠️  Restauration explicitement autorisée sans checksum."
fi

# Le conteneur PostgreSQL est la source de vérité pour les identifiants résolus.
compose up -d --wait --wait-timeout 120 postgres
POSTGRES_USER="$(compose exec -T postgres printenv POSTGRES_USER)"
POSTGRES_DB="$(compose exec -T postgres printenv POSTGRES_DB)"
[[ "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "❌ POSTGRES_USER non sûr pour une restauration automatisée."
  exit 1
}
[[ "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "❌ POSTGRES_DB non sûr pour une restauration automatisée."
  exit 1
}

echo "⚠️  La base '$POSTGRES_DB' sera supprimée puis recréée."
echo "   Une sauvegarde de sécurité sera créée avant l'arrêt des services."
if [ -n "${RESTORE_CONFIRM:-}" ]; then
  answer="$RESTORE_CONFIRM"
elif ! read -r -p "Saisir exactement le nom de la base pour confirmer : " answer; then
  echo "❌ Confirmation illisible sur l'entrée standard."
  exit 1
fi
[ "$answer" = "$POSTGRES_DB" ] || { echo "Abandon."; exit 1; }

# Pas de rotation ici : le dump source peut être un ancien fichier du même
# dossier et ne doit pas disparaître avant son import.
SKIP_BACKUP_ROTATION=true ./scripts/backup.sh
SAFETY_BACKUP="$(find "${BACKUP_DIR:-$ROOT/backups}" -maxdepth 1 -name 'sovrack-*.sql.gz' -type f -printf '%T@ %p\n' | sort -nr | sed -n '1s/^[^ ]* //p')"
echo "🛟 Sauvegarde avant restauration : ${SAFETY_BACKUP:-créée dans le dossier backups}"

restore_succeeded=false
on_exit() {
  if [ "$restore_succeeded" != "true" ]; then
    echo "❌ Restauration interrompue : nginx/frontend/backend/worker restent arrêtés."
    echo "   Sauvegarde de retour : ${SAFETY_BACKUP:-voir le dossier backups}."
  fi
}
trap on_exit EXIT

# Ferme l'entrée publique et tous les processus susceptibles d'écrire en base.
compose stop nginx frontend backend worker

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"
compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T postgres createdb -U "$POSTGRES_USER" -T template0 "$POSTGRES_DB"

case "$DUMP" in
  *.gz) gzip -dc "$DUMP" ;;
  *) cat "$DUMP" ;;
esac | compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Force l'exécution du migrateur de la release courante sur le schéma restauré.
compose stop migrator >/dev/null 2>&1 || true
compose rm -f migrator >/dev/null 2>&1 || true
compose up -d --remove-orphans --wait --wait-timeout 240 \
  postgres redis migrator backend worker frontend nginx
compose ps

restore_succeeded=true
echo "✅ Restauration, migrations et contrôles de santé terminés."
