#!/usr/bin/env bash
# Release-aware schema rollback: old database dump + matching old images/infra.
set -euo pipefail

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
RELEASE_ID="${1:-}"
DUMP="${2:-}"
[ -n "$RELEASE_ID" ] && [ -n "$DUMP" ] && [ -z "${3:-}" ] || {
  echo "Usage: $0 <release-id> <backup.sql.gz>"
  exit 1
}
[[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "ERROR: release id invalide."
  exit 1
}

TARGET="$BASE_DIR/releases/$RELEASE_ID"
MANIFEST="$BASE_DIR/shared/release-manifests/$RELEASE_ID.manifest"
[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || {
  echo "ERROR: release installée introuvable : $TARGET"
  exit 1
}
[ -f "$MANIFEST" ] || {
  echo "ERROR: manifeste archivé introuvable : $MANIFEST"
  exit 1
}

echo "Rollback target: $RELEASE_ID. This restores the database; it is not an image-only rollback."
SOVRACK_BASE_DIR="$BASE_DIR" \
  "$TARGET/scripts/restore.sh" "$DUMP" --release-file "$MANIFEST" --mode exact
