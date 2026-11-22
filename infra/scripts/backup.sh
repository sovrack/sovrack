#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Consistent PostgreSQL dump with checksum and release/schema metadata.
set -euo pipefail
umask 077

# Acquisition du verrou flock exclusif pour empêcher tout conflit
if [ "${SOVRACK_LOCK_ACQUIRED:-false}" != "true" ]; then
  LOCK_FILE="/var/run/lock/sovrack.lock"
  [ -d "/var/run/lock" ] && [ -w "/var/run/lock" ] || LOCK_FILE="/tmp/sovrack.lock"
  exec 200>"$LOCK_FILE"
  flock -n 200 || {
    echo "ERROR: Une autre opération Sovrack (déploiement/sauvegarde/restauration) est déjà en cours d'exécution." >&2
    exit 1
  }
  export SOVRACK_LOCK_ACQUIRED=true
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
SECRETS_ENV="${ENV_FILE:-}"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"
SECRETS_ENV="${SECRETS_ENV:-$(resolve_secrets_env "$ROOT" "$BASE_DIR")}"
export COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"

compose() {
  local -a args=(--env-file "$SECRETS_ENV")
  if [ -n "${RELEASE_FILE:-}" ]; then
    args+=(--env-file "$RELEASE_FILE")
  fi
  docker compose "${args[@]}" -f "$COMPOSE_FILE" "$@"
}

[ -f "$SECRETS_ENV" ] || {
  echo "ERROR: fichier de secrets introuvable : $SECRETS_ENV"
  exit 1
}

P_USER="$(compose exec -T postgres printenv POSTGRES_USER)"
P_DB="$(compose exec -T postgres printenv POSTGRES_DB)"
[ -n "$P_USER" ] && [ -n "$P_DB" ] || {
  echo "ERROR: impossible de résoudre les identifiants PostgreSQL."
  exit 1
}

BACKUP_DIR="${BACKUP_DIR:-$BASE_DIR/shared/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
DEST="$(mktemp "$BACKUP_DIR/sovrack-$STAMP-XXXXXX.sql.gz")"
DEST_NAME="$(basename "$DEST")"

cleanup_failed_backup() {
  rm -f -- "$DEST" "$DEST.sha256" "$DEST.metadata"
}
trap cleanup_failed_backup ERR

echo "PostgreSQL backup -> $DEST"
compose exec -T postgres pg_dump --no-owner --no-privileges \
  -U "$P_USER" -d "$P_DB" | gzip -9 > "$DEST"
gzip -t "$DEST"
(cd "$BACKUP_DIR" && sha256sum "$DEST_NAME" > "$DEST_NAME.sha256")

schema_migration="unmanaged"
migrations_table="$(compose exec -T postgres psql -At -U "$P_USER" -d "$P_DB" \
  -c 'SELECT to_regclass('\''public."_prisma_migrations"'\'') IS NOT NULL;')"
if [ "$migrations_table" = "t" ]; then
  schema_migration="$(last_applied_migration compose)"
fi

release_id="unmanaged"
server_container_id="$(compose ps --all --quiet server 2>/dev/null || compose ps --all --quiet backend 2>/dev/null || true)"
web_container_id="$(compose ps --all --quiet web 2>/dev/null || compose ps --all --quiet frontend 2>/dev/null || true)"
server_image=""
web_image=""
if [ -n "$server_container_id" ]; then
  server_image="$(docker inspect "$server_container_id" --format '{{.Config.Image}}')"
fi
if [ -n "$web_container_id" ]; then
  web_image="$(docker inspect "$web_container_id" --format '{{.Config.Image}}')"
fi
if [ -n "${RELEASE_FILE:-}" ]; then
  validate_release_manifest "$RELEASE_FILE"
  release_id="$(read_env_value RELEASE_ID "$RELEASE_FILE")"
fi
release_id="${BACKUP_RELEASE_ID_OVERRIDE:-$release_id}"
[[ "$release_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "ERROR: BACKUP_RELEASE_ID_OVERRIDE invalide."
  exit 1
}
dump_sha256="$(sha256sum "$DEST" | awk '{print $1}')"
{
  printf 'BACKUP_FORMAT_VERSION=1\n'
  printf 'CREATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'DATABASE=%s\n' "$P_DB"
  printf 'SCHEMA_MIGRATION=%s\n' "$schema_migration"
  printf 'RELEASE_ID=%s\n' "$release_id"
  printf 'SERVER_IMAGE=%s\n' "$server_image"
  printf 'WEB_IMAGE=%s\n' "$web_image"
  printf 'BACKEND_IMAGE=%s\n' "$server_image"
  printf 'FRONTEND_IMAGE=%s\n' "$web_image"
  printf 'DUMP_SHA256=%s\n' "$dump_sha256"
} > "$DEST.metadata"
chmod 600 "$DEST" "$DEST.sha256" "$DEST.metadata"

RETENTION="${BACKUP_RETENTION:-7}"
if [ "${SKIP_BACKUP_ROTATION:-false}" = "true" ]; then
  echo "Backup rotation skipped for this safety copy."
else
  [[ "$RETENTION" =~ ^[1-9][0-9]*$ ]] || {
    echo "ERROR: BACKUP_RETENTION doit être un entier strictement positif."
    exit 1
  }
  find "$BACKUP_DIR" -maxdepth 1 -name 'sovrack-*.sql.gz' -type f \
    | sort -r | tail -n +$((RETENTION + 1)) | while read -r old_backup; do
        rm -- "$old_backup"
        rm -f -- "$old_backup.sha256" "$old_backup.metadata"
      done
fi

if [ "${BACKUP_OFFSITE_ENABLED:-false}" = "true" ]; then
  "$ROOT/scripts/backup-offsite.sh" "$DEST"
fi

trap - ERR
echo "Backup verified: $DEST (+ checksum + metadata)."
