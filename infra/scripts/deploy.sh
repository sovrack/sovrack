#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Deploy one immutable release from its versioned directory.
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

if [ "${1:-}" = "--release-file" ] && [ -n "${2:-}" ] && [ -z "${3:-}" ]; then
  RELEASE_FILE="$(realpath "$2")"
else
  echo "Usage: $0 --release-file <manifest>"
  exit 1
fi
validate_release_manifest "$RELEASE_FILE"
runtime_services=(backend)
pull_services=(backend frontend migrator)
configure_runtime_topology
if [ "$RUNTIME_TOPOLOGY" = "split" ]; then
  runtime_services+=(worker)
  pull_services+=(worker)
fi

SECRETS_ENV="$(resolve_secrets_env "$ROOT" "$BASE_DIR")"
export ENV_FILE="$SECRETS_ENV"

# A bundle records the exact infra commit before packaging. A local Git checkout
# may use HEAD instead, which keeps the same invariant during rehearsals.
if [ -f "$ROOT/.infra-commit" ]; then
  packaged_infra_commit="$(tr -d '\r\n' < "$ROOT/.infra-commit")"
elif git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  packaged_infra_commit="$(git -C "$ROOT" rev-parse HEAD)"
else
  echo "ERROR: impossible de prouver le commit de l'infrastructure."
  exit 1
fi
[ "$packaged_infra_commit" = "$INFRA_COMMIT" ] || {
  echo "ERROR: le bundle infra ne correspond pas à INFRA_COMMIT."
  exit 1
}

"$ROOT/scripts/preflight.sh" --release-file "$RELEASE_FILE"

mkdir -p "$SHARED_DIR/backups" "$SHARED_DIR/logs" \
  "$SHARED_DIR/release-manifests" "$MAINTENANCE_DIR"
chmod 700 "$SHARED_DIR" "$SHARED_DIR/backups" "$SHARED_DIR/logs" \
  "$SHARED_DIR/release-manifests" "$MAINTENANCE_DIR"

compose() {
  docker compose --env-file "$SECRETS_ENV" --env-file "$RELEASE_FILE" \
    -f "$COMPOSE_FILE" "$@"
}

deployment_succeeded=false
maintenance_enabled=false
on_exit() {
  if [ "$deployment_succeeded" != "true" ]; then
    if [ "$maintenance_enabled" = "true" ]; then
      echo "ERROR: promotion interrompue ; la maintenance reste activée et les writers ne sont pas relancés automatiquement."
    fi
    echo "       Examiner les logs et utiliser scripts/rollback.sh avec le backup pré-release."
  fi
}
trap on_exit EXIT

echo "Sovrack release $RELEASE_ID"
compose config -q

# Network transfer and image availability are checked before the maintenance
# window. Infrastructure images are upgraded only through their own manifest.
compose pull "${pull_services[@]}"

if [ "${SKIP_IMAGE_PROVENANCE_CHECK:-false}" != "true" ]; then
  backend_revision="$(docker image inspect "$BACKEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  frontend_revision="$(docker image inspect "$FRONTEND_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  backend_contract="$(docker image inspect "$BACKEND_IMAGE" --format '{{index .Config.Labels "tech.sovrack.openapi.sha256"}}')"
  frontend_contract="$(docker image inspect "$FRONTEND_IMAGE" --format '{{index .Config.Labels "tech.sovrack.openapi.sha256"}}')"
  [ "$backend_revision" = "$BACKEND_COMMIT" ] || { echo "ERROR: label commit backend invalide."; exit 1; }
  [ "$frontend_revision" = "$FRONTEND_COMMIT" ] || { echo "ERROR: label commit frontend invalide."; exit 1; }
  [ "$backend_contract" = "$OPENAPI_SHA256" ] || { echo "ERROR: contrat OpenAPI backend invalide."; exit 1; }
  [ "$frontend_contract" = "$OPENAPI_SHA256" ] || { echo "ERROR: contrat OpenAPI frontend incompatible."; exit 1; }
fi

postgres_was_running="$(docker inspect sovrack-postgres --format '{{.State.Running}}' 2>/dev/null || true)"
if [ "$postgres_was_running" = "true" ]; then
  postgres_user="$(compose exec -T postgres printenv POSTGRES_USER)"
  postgres_db="$(compose exec -T postgres printenv POSTGRES_DB)"
  migrations_table="$(compose exec -T postgres psql -At -U "$postgres_user" -d "$postgres_db" \
    -c 'SELECT to_regclass('\''public."_prisma_migrations"'\'') IS NOT NULL;')"
  if [ "$migrations_table" = "t" ]; then
    current_schema="$(last_applied_migration compose)"
    if [[ "$current_schema" > "$SCHEMA_MIGRATION" ]]; then
      echo "ERROR: la base ($current_schema) est plus récente que la release ($SCHEMA_MIGRATION)."
      exit 1
    fi
  fi
else
  compose up -d --wait --wait-timeout 180 postgres redis
fi

# Nginx is recreated first with a shared maintenance flag. The old API and
# worker are quiesced before the final backup, so no write can cross the dump.
touch "$MAINTENANCE_DIR/enabled"
maintenance_enabled=true
compose up -d --no-deps --wait --wait-timeout 120 nginx
compose stop -t 60 frontend backend >/dev/null 2>&1 || true
docker stop -t 60 sovrack-worker >/dev/null 2>&1 || true

if [ "$postgres_was_running" = "true" ]; then
  RELEASE_FILE="$RELEASE_FILE" BACKUP_DIR="$SHARED_DIR/backups" \
    "$ROOT/scripts/backup.sh"
else
  echo "First installation: no existing database to back up."
fi

# Apply database/cache container configuration only after writers are stopped
# and the pre-release backup is complete; this avoids a surprise Postgres
# recreation while the old API is still accepting requests.
compose up -d --wait --wait-timeout 180 postgres redis

# Never rely on a stale completed migrator container. The one-shot execution is
# the only component allowed to alter the schema for this release.
compose rm -sf migrator >/dev/null 2>&1 || true
compose run --rm --no-deps migrator
assert_schema_migration compose "$SCHEMA_MIGRATION"

compose up -d --no-deps --wait --wait-timeout 300 "${runtime_services[@]}"
compose up -d --no-deps --wait --wait-timeout 240 frontend nginx
compose exec -T backend node -e \
  "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
compose exec -T frontend wget -qO- http://127.0.0.1:3000/ >/dev/null
compose exec -T nginx nginx -t

manifest_destination="$SHARED_DIR/release-manifests/$RELEASE_ID.manifest"
if [ -e "$manifest_destination" ]; then
  cmp -s "$RELEASE_FILE" "$manifest_destination" || {
    echo "ERROR: RELEASE_ID existe déjà avec un manifeste différent."
    exit 1
  }
else
  install -m 600 "$RELEASE_FILE" "$manifest_destination"
fi

rm -f "$MAINTENANCE_DIR/enabled"
maintenance_enabled=false

domain="$(read_env_value DOMAIN "$SECRETS_ENV")"
# shellcheck disable=SC2016
if compose exec -T nginx sh -c 'test -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"'; then
  curl --fail --show-error --silent --max-time 20 \
    "https://$domain/backend-api/health" >/dev/null
else
  echo "TLS certificate absent: public HTTPS smoke test deferred until certbot."
fi

activate_release_directory "$BASE_DIR" "$ROOT" "$RELEASE_ID"
compose ps
deployment_succeeded=true
echo "Release $RELEASE_ID promoted atomically."
