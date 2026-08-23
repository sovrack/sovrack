#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Restore a verified dump either exactly (rollback) or with an explicit upgrade.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
SHARED_DIR="$BASE_DIR/shared"
MAINTENANCE_DIR="${SOVRACK_MAINTENANCE_DIR:-$SHARED_DIR/maintenance}"
export SOVRACK_MAINTENANCE_DIR="$MAINTENANCE_DIR"
export COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"

DUMP="${1:-}"
[ -n "$DUMP" ] || {
  echo "Usage: $0 <backup.sql[.gz]|backup.dump> --release-file <manifest> [--mode exact|upgrade] [--allow-unverified]"
  exit 1
}
shift

RELEASE_FILE=""
MODE="exact"
ALLOW_UNVERIFIED=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-file)
      [ -n "${2:-}" ] || { echo "ERROR: manifeste manquant."; exit 1; }
      RELEASE_FILE="$(realpath "$2")"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --allow-unverified)
      ALLOW_UNVERIFIED=true
      shift
      ;;
    *)
      echo "ERROR: option inconnue : $1"
      exit 1
      ;;
  esac
done
[ "$MODE" = "exact" ] || [ "$MODE" = "upgrade" ] || {
  echo "ERROR: --mode doit valoir exact ou upgrade."
  exit 1
}
[ -n "$RELEASE_FILE" ] || {
  echo "ERROR: --release-file est obligatoire : une restauration doit cibler une release précise."
  exit 1
}
validate_release_manifest "$RELEASE_FILE"
runtime_services=(backend)
pull_services=(backend frontend migrator)
configure_runtime_topology
if [ "$RUNTIME_TOPOLOGY" = "split" ]; then
  runtime_services+=(worker)
  pull_services+=(worker)
fi

[ -f "$DUMP" ] && [ ! -L "$DUMP" ] || {
  echo "ERROR: dump absent ou lien symbolique refusé : $DUMP"
  exit 1
}
DUMP="$(realpath "$DUMP")"
SECRETS_ENV="$(resolve_secrets_env "$ROOT" "$BASE_DIR")"
[ -f "$SECRETS_ENV" ] || { echo "ERROR: fichier de secrets absent."; exit 1; }

if [[ "$DUMP" == *.gz ]]; then
  gzip -t "$DUMP"
fi
if [ -f "$DUMP.sha256" ]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
elif [ "$ALLOW_UNVERIFIED" != "true" ]; then
  echo "ERROR: checksum absent : $DUMP.sha256"
  exit 1
fi

backup_schema=""
if [ -f "$DUMP.metadata" ]; then
  require_single_env_key BACKUP_FORMAT_VERSION "$DUMP.metadata"
  require_single_env_key SCHEMA_MIGRATION "$DUMP.metadata"
  require_single_env_key DUMP_SHA256 "$DUMP.metadata"
  [ "$(read_env_value BACKUP_FORMAT_VERSION "$DUMP.metadata")" = "1" ] || {
    echo "ERROR: format de métadonnées inconnu."
    exit 1
  }
  actual_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
  [ "$actual_sha" = "$(read_env_value DUMP_SHA256 "$DUMP.metadata")" ] || {
    echo "ERROR: les métadonnées ne correspondent pas au dump."
    exit 1
  }
  backup_schema="$(read_env_value SCHEMA_MIGRATION "$DUMP.metadata")"
elif [ "$ALLOW_UNVERIFIED" != "true" ]; then
  echo "ERROR: métadonnées absentes : $DUMP.metadata"
  exit 1
fi
if [ "$MODE" = "exact" ] && [ -n "$backup_schema" ] \
  && [ "$backup_schema" != "$SCHEMA_MIGRATION" ]; then
  echo "ERROR: rollback exact impossible : dump=$backup_schema, release=$SCHEMA_MIGRATION."
  exit 1
fi

compose() {
  docker compose --env-file "$SECRETS_ENV" --env-file "$RELEASE_FILE" \
    -f "$COMPOSE_FILE" "$@"
}

mkdir -p "$SHARED_DIR/backups" "$SHARED_DIR/release-manifests" "$MAINTENANCE_DIR"
chmod 700 "$SHARED_DIR/backups" "$SHARED_DIR/release-manifests" "$MAINTENANCE_DIR"
compose config -q
compose pull "${pull_services[@]}"
postgres_was_running="$(docker inspect sovrack-postgres --format '{{.State.Running}}' 2>/dev/null || true)"
if [ "$postgres_was_running" != "true" ]; then
  compose up -d --wait --wait-timeout 180 postgres redis
fi

POSTGRES_USER="$(compose exec -T postgres printenv POSTGRES_USER)"
POSTGRES_DB="$(compose exec -T postgres printenv POSTGRES_DB)"
[[ "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "ERROR: POSTGRES_USER non sûr pour une restauration automatisée."
  exit 1
}
[[ "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || {
  echo "ERROR: POSTGRES_DB non sûr pour une restauration automatisée."
  exit 1
}

echo "The database '$POSTGRES_DB' will be replaced by $(basename "$DUMP") in $MODE mode."
if [ -n "${RESTORE_CONFIRM:-}" ]; then
  answer="$RESTORE_CONFIRM"
elif ! read -r -p "Type the database name to confirm: " answer; then
  echo "ERROR: confirmation unavailable."
  exit 1
fi
[ "$answer" = "$POSTGRES_DB" ] || { echo "Aborted."; exit 1; }

restore_succeeded=false
SAFETY_BACKUP=""
on_exit() {
  if [ "$restore_succeeded" != "true" ]; then
    echo "ERROR: restore interrupted; maintenance remains enabled and application writers remain stopped."
    echo "       Safety backup: ${SAFETY_BACKUP:-see $SHARED_DIR/backups}."
  fi
}
trap on_exit EXIT

touch "$MAINTENANCE_DIR/enabled"
compose up -d --no-deps --wait --wait-timeout 120 nginx
compose stop -t 60 frontend backend >/dev/null 2>&1 || true
docker stop -t 60 sovrack-worker >/dev/null 2>&1 || true

current_release_id="unmanaged"
if [ -L "$BASE_DIR/current" ]; then
  current_release_id="$(basename "$(realpath "$BASE_DIR/current")")"
fi
SKIP_BACKUP_ROTATION=true BACKUP_DIR="$SHARED_DIR/backups" \
  BACKUP_RELEASE_ID_OVERRIDE="$current_release_id" RELEASE_FILE="$RELEASE_FILE" \
  "$ROOT/scripts/backup.sh"
SAFETY_BACKUP="$(find "$SHARED_DIR/backups" -maxdepth 1 -name 'sovrack-*.sql.gz' \
  -type f -printf '%T@ %p\n' | sort -nr | sed -n '1s/^[^ ]* //p')"

compose up -d --wait --wait-timeout 180 postgres redis

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"
compose exec -T postgres dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"
compose exec -T postgres createdb -U "$POSTGRES_USER" -T template0 "$POSTGRES_DB"

if [[ "$DUMP" != *.gz ]] && LC_ALL=C head -c 5 "$DUMP" | grep -q '^PGDMP$'; then
  compose exec -T postgres pg_restore --exit-on-error --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DUMP"
else
  case "$DUMP" in
    *.gz) gzip -dc "$DUMP" ;;
    *) sed -n '1,$p' "$DUMP" ;;
  esac | compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
fi

if [ "$MODE" = "upgrade" ]; then
  compose rm -sf migrator >/dev/null 2>&1 || true
  compose run --rm --no-deps migrator
fi
assert_schema_migration compose "$SCHEMA_MIGRATION"

compose up -d --no-deps --wait --wait-timeout 300 "${runtime_services[@]}"
compose up -d --no-deps --wait --wait-timeout 240 frontend nginx
compose exec -T backend node -e \
  "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
compose exec -T frontend wget -qO- http://127.0.0.1:3000/ >/dev/null

manifest_destination="$SHARED_DIR/release-manifests/$RELEASE_ID.manifest"
if [ ! -e "$manifest_destination" ]; then
  install -m 600 "$RELEASE_FILE" "$manifest_destination"
else
  cmp -s "$RELEASE_FILE" "$manifest_destination"
fi
if [ "${SOVRACK_SKIP_ACTIVATION:-false}" != "true" ]; then
  activate_release_directory "$BASE_DIR" "$ROOT" "$RELEASE_ID"
fi
rm -f "$MAINTENANCE_DIR/enabled"

restore_succeeded=true
echo "Restore completed in $MODE mode on release $RELEASE_ID."
