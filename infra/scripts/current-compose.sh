#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
CURRENT="$(realpath "$BASE_DIR/current")"
case "$CURRENT" in
  "$BASE_DIR"/releases/*) ;;
  *) echo "ERROR: current ne pointe pas vers une release versionnée."; exit 1 ;;
esac
release_id="$(basename "$CURRENT")"
manifest="$BASE_DIR/shared/release-manifests/$release_id.manifest"
[ -f "$manifest" ] || { echo "ERROR: manifeste actif introuvable."; exit 1; }
runtime_topology="$(awk -F= '$1 == "RUNTIME_TOPOLOGY" { print $2 }' "$manifest")"
RUNTIME_TOPOLOGY="$runtime_topology"
configure_runtime_topology

export SOVRACK_MAINTENANCE_DIR="$BASE_DIR/shared/maintenance"
exec docker compose --env-file "$BASE_DIR/shared/.env" --env-file "$manifest" \
  -f "$CURRENT/docker-compose.prod.yml" "$@"
