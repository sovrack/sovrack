#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
CURRENT="$(realpath "$BASE_DIR/current")"
case "$CURRENT" in
  "$BASE_DIR"/releases/*) ;;
  *) echo "ERROR: current ne pointe pas vers une release versionnée."; exit 1 ;;
esac
release_id="$(basename "$CURRENT")"
manifest="$BASE_DIR/shared/release-manifests/$release_id.manifest"
[ -f "$manifest" ] || { echo "ERROR: manifeste actif introuvable."; exit 1; }

SOVRACK_BASE_DIR="$BASE_DIR" \
ENV_FILE="$BASE_DIR/shared/.env" \
RELEASE_FILE="$manifest" \
BACKUP_DIR="$BASE_DIR/shared/backups" \
  "$CURRENT/scripts/backup.sh"
