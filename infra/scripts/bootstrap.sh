#!/usr/bin/env bash
# Initialize the versioned release layout without overwriting existing secrets.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
SHARED_DIR="$BASE_DIR/shared"

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker absent."; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: daemon Docker inaccessible."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: Docker Compose v2 requis."; exit 1; }

mkdir -p "$BASE_DIR/releases" "$BASE_DIR/incoming" \
  "$SHARED_DIR/backups" "$SHARED_DIR/logs" \
  "$SHARED_DIR/maintenance" "$SHARED_DIR/release-manifests"
chmod 700 "$BASE_DIR/releases" "$BASE_DIR/incoming" "$SHARED_DIR" \
  "$SHARED_DIR/backups" "$SHARED_DIR/logs" \
  "$SHARED_DIR/maintenance" "$SHARED_DIR/release-manifests"

target_env="$SHARED_DIR/.env"
if [ ! -f "$target_env" ]; then
  if [ -f "$BASE_DIR/.env" ] && [ "$BASE_DIR/.env" != "$target_env" ]; then
    # Transition from the legacy flat layout: copy, never move/delete, so the
    # old stack remains recoverable until the first release rehearsal passes.
    install -m 600 "$BASE_DIR/.env" "$target_env"
    echo "Existing secrets copied to shared/.env; the legacy file was preserved."
  elif [ -f "$ROOT/.env.production.example" ]; then
    install -m 600 "$ROOT/.env.production.example" "$target_env"
    echo "shared/.env created from the template; replace every placeholder."
  else
    echo "ERROR: no existing .env and no production template."
    exit 1
  fi
else
  chmod 600 "$target_env"
  echo "Existing shared/.env preserved."
fi

if grep -qE '(change_me_|CHANGE_ME_|REPLACE_WITH_|Dev_Test_Only_1192)' "$target_env"; then
  echo "WARNING: shared/.env still contains placeholders; preflight will refuse deployment."
fi
echo "Versioned layout ready in $BASE_DIR."
