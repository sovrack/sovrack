#!/usr/bin/env bash
# Forced-command SSH endpoint: export exactly the latest verified DB backup.
set -euo pipefail

BACKUP_DIR="${SOVRACK_BACKUP_DIR:-/srv/sovrack/shared/backups}"
[ -d "$BACKUP_DIR" ] || {
  echo "ERROR: backup directory unavailable." >&2
  exit 1
}

latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sovrack-*.sql.gz' \
  -printf '%T@ %f\n' | sort -n | tail -1 | cut -d' ' -f2-)"
[ -n "$latest" ] || {
  echo "ERROR: no PostgreSQL backup is available." >&2
  exit 1
}

for artifact in "$latest" "$latest.sha256" "$latest.metadata"; do
  [ -f "$BACKUP_DIR/$artifact" ] || {
    echo "ERROR: incomplete backup artifact set." >&2
    exit 1
  }
done

(cd "$BACKUP_DIR" && sha256sum -c "$latest.sha256" >/dev/null)
gzip -t "$BACKUP_DIR/$latest"
tar -C "$BACKUP_DIR" -cf - -- "$latest" "$latest.sha256" "$latest.metadata"
