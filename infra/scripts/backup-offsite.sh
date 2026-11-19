#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# Upload verified backup artifacts to an encrypted Restic repository.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"
SECRETS_ENV="$(resolve_secrets_env "$ROOT" "$BASE_DIR")"

RESTIC_IMAGE="$(read_env_value RESTIC_IMAGE "$SECRETS_ENV")"
if [ -z "$RESTIC_IMAGE" ] || ! is_immutable_image "$RESTIC_IMAGE"; then
  echo "ERROR: RESTIC_IMAGE doit être une référence immuable."
  exit 1
fi
for key in RESTIC_REPOSITORY RESTIC_PASSWORD; do
  require_single_env_key "$key" "$SECRETS_ENV"
done

restic_env="$(mktemp)"
cleanup() {
  rm -f -- "$restic_env"
}
trap cleanup EXIT
chmod 600 "$restic_env"
for key in \
  RESTIC_REPOSITORY RESTIC_PASSWORD RESTIC_REST_USERNAME RESTIC_REST_PASSWORD \
  AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION; do
  if [ "$(grep -c "^${key}=" "$SECRETS_ENV" || true)" -eq 1 ]; then
    printf '%s=%s\n' "$key" "$(read_env_value "$key" "$SECRETS_ENV")" >> "$restic_env"
  fi
done

restic() {
  docker run --rm --env-file "$restic_env" \
    -v "${BACKUP_DIR:-$BASE_DIR/shared/backups}:/backups:ro" \
    "$RESTIC_IMAGE" "$@"
}

if [ "${1:-}" = "--init" ] && [ -z "${2:-}" ]; then
  restic init
  echo "Encrypted off-site repository initialized."
  exit 0
fi

DUMP="${1:-}"
[ -f "$DUMP" ] && [ -f "$DUMP.sha256" ] && [ -f "$DUMP.metadata" ] || {
  echo "Usage: $0 <backup.sql.gz>  (checksum and metadata required)"
  echo "       $0 --init"
  exit 1
}
backup_dir="$(realpath "$(dirname "$DUMP")")"
configured_dir="$(realpath "${BACKUP_DIR:-$BASE_DIR/shared/backups}")"
[ "$backup_dir" = "$configured_dir" ] || {
  echo "ERROR: le dump doit appartenir au dossier de backups configuré."
  exit 1
}

dump_name="$(basename "$DUMP")"
(cd "$configured_dir" && sha256sum -c "$dump_name.sha256")
restic backup "/backups/$dump_name" "/backups/$dump_name.sha256" \
  "/backups/$dump_name.metadata" --tag sovrack-postgres
restic snapshots --latest 1 --tag sovrack-postgres
echo "Encrypted off-site copy verified in the Restic repository."
