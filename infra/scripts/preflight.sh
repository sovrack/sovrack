#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Production preflight. It prints only structure/measurements, never secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"

RELEASE_FILE=""
if [ "${1:-}" = "--release-file" ] && [ -n "${2:-}" ] && [ -z "${3:-}" ]; then
  RELEASE_FILE="$2"
else
  echo "Usage: $0 --release-file <manifest>"
  exit 1
fi
validate_release_manifest "$RELEASE_FILE"
configure_runtime_topology

SECRETS_ENV="$(resolve_secrets_env "$ROOT" "$BASE_DIR")"
[ -f "$SECRETS_ENV" ] && [ ! -L "$SECRETS_ENV" ] || {
  echo "ERROR: fichier de secrets absent ou lien symbolique refusé : $SECRETS_ENV"
  exit 1
}

for command in docker awk grep gzip sha256sum realpath; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: commande requise absente : $command"
    exit 1
  }
done
docker info >/dev/null 2>&1
docker compose version >/dev/null 2>&1

required_keys=(
  DOMAIN POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB REDIS_PASSWORD
  JWT_SECRET STAFF_JWT_SECRET CONFIG_SECRET
)
for key in "${required_keys[@]}"; do
  require_single_env_key "$key" "$SECRETS_ENV"
done

if grep -qE '(change_me_|CHANGE_ME_|REPLACE_WITH_|Dev_Test_Only_1192)' "$SECRETS_ENV"; then
  echo "ERROR: le fichier de secrets contient un placeholder connu."
  exit 1
fi

for key in POSTGRES_PASSWORD REDIS_PASSWORD JWT_SECRET STAFF_JWT_SECRET CONFIG_SECRET; do
  value="$(read_env_value "$key" "$SECRETS_ENV")"
  [ "${#value}" -ge 24 ] || {
    echo "ERROR: $key doit contenir au moins 24 caractères."
    exit 1
  }
done
[ "$(read_env_value JWT_SECRET "$SECRETS_ENV")" != "$(read_env_value STAFF_JWT_SECRET "$SECRETS_ENV")" ] || {
  echo "ERROR: JWT_SECRET et STAFF_JWT_SECRET doivent être indépendants."
  exit 1
}

minimum_memory_mb="$(read_env_value MIN_HOST_MEMORY_MB "$SECRETS_ENV")"
if [ -z "$minimum_memory_mb" ]; then
  if [ "$RUNTIME_TOPOLOGY" = "split" ]; then
    minimum_memory_mb=7168
  else
    minimum_memory_mb=3584
  fi
fi
minimum_disk_mb="$(read_env_value MIN_HOST_FREE_DISK_MB "$SECRETS_ENV")"
minimum_disk_mb="${minimum_disk_mb:-8192}"
[[ "$minimum_memory_mb" =~ ^[1-9][0-9]*$ ]] || {
  echo "ERROR: MIN_HOST_MEMORY_MB invalide."
  exit 1
}
[[ "$minimum_disk_mb" =~ ^[1-9][0-9]*$ ]] || {
  echo "ERROR: MIN_HOST_FREE_DISK_MB invalide."
  exit 1
}

actual_memory_mb="$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)"
actual_disk_mb="$(df -Pm "$BASE_DIR" | awk 'NR == 2 { print $4 }')"
allow_undersized="$(read_env_value ALLOW_UNDERSIZED_HOST "$SECRETS_ENV")"
allow_undersized="${allow_undersized:-false}"
if { [ "$actual_memory_mb" -lt "$minimum_memory_mb" ] || [ "$actual_disk_mb" -lt "$minimum_disk_mb" ]; } \
  && [ "$allow_undersized" != "true" ]; then
  echo "ERROR: capacité insuffisante : RAM=${actual_memory_mb}MiB (minimum ${minimum_memory_mb}), disque libre=${actual_disk_mb}MiB (minimum ${minimum_disk_mb})."
  echo "       Redimensionner l'hôte ou définir temporairement ALLOW_UNDERSIZED_HOST=true après un test de charge documenté."
  exit 1
fi

export SOVRACK_MAINTENANCE_DIR="${SOVRACK_MAINTENANCE_DIR:-$BASE_DIR/shared/maintenance}"
docker compose --env-file "$SECRETS_ENV" --env-file "$RELEASE_FILE" \
  -f "$ROOT/docker-compose.prod.yml" config -q

echo "Preflight OK : manifeste strict, secrets structurels, Docker, ${actual_memory_mb}MiB RAM et ${actual_disk_mb}MiB disque libre."
