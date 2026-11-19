#!/usr/bin/env bash
# Pull the restricted VPS backup stream into an encrypted local Restic repo.
set -euo pipefail
umask 077

[ "${EUID:-$(id -u)}" -eq 0 ] || {
  echo "ERROR: exécuter avec sudo/root."
  exit 1
}

REMOTE_HOST="${SOVRACK_BACKUP_HOST:-vps-798e6d80.vps.ovh.net}"
REMOTE_USER="${SOVRACK_BACKUP_USER:-ubuntu}"
STATE_DIR="${SOVRACK_OFFSITE_STATE_DIR:-/opt/sovrack-offsite}"
REPOSITORY="${SOVRACK_OFFSITE_REPOSITORY:-/srv/sovrack-offsite/restic}"
SSH_KEY="$STATE_DIR/id_ed25519"
KNOWN_HOSTS="$STATE_DIR/known_hosts"
PASSWORD_FILE="$STATE_DIR/restic-password"
RESTIC_IMAGE="${RESTIC_IMAGE:-restic/restic@sha256:136600b6ff6843d61d355f7f71f460a166429f35de6fd11b568fece3c9a4d510}"

[[ "$RESTIC_IMAGE" =~ @sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: RESTIC_IMAGE doit être immuable."
  exit 1
}
for required in "$SSH_KEY" "$KNOWN_HOSTS" "$PASSWORD_FILE"; do
  [ -s "$required" ] || {
    echo "ERROR: fichier requis absent : $required"
    exit 1
  }
done

install -d -m 0700 "$REPOSITORY"
SOURCE_DIR="$(mktemp -d /run/sovrack-offsite-source.XXXXXX)"
RESTORE_DIR="$(mktemp -d /run/sovrack-offsite-restore.XXXXXX)"
cleanup() {
  find "$SOURCE_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$SOURCE_DIR" 2>/dev/null || true
  find "$RESTORE_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$RESTORE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

ssh -T \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$KNOWN_HOSTS" \
  -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
  | tar -C "$SOURCE_DIR" -xf -
# Le tar conserve l'UID du compte VPS. Restic s'exécute sans capacités Linux ;
# rendre root propriétaire de cette copie éphémère évite tout DAC_OVERRIDE.
chown -R 0:0 "$SOURCE_DIR"

dump="$(find "$SOURCE_DIR" -maxdepth 1 -type f -name 'sovrack-*.sql.gz' -print -quit)"
[ -n "$dump" ] && [ -f "$dump.sha256" ] && [ -f "$dump.metadata" ] || {
  echo "ERROR: l'export VPS ne contient pas les trois artefacts attendus."
  exit 1
}
(cd "$SOURCE_DIR" && sha256sum -c "$(basename "$dump").sha256")
gzip -t "$dump"

restic() {
  docker run --rm \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
    -v "$PASSWORD_FILE:/run/secrets/restic-password:ro" \
    -v "$REPOSITORY:/repository" \
    "$RESTIC_IMAGE" -r /repository "$@"
}

if [ ! -f "$REPOSITORY/config" ]; then
  restic init
fi

docker run --rm \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v "$PASSWORD_FILE:/run/secrets/restic-password:ro" \
  -v "$REPOSITORY:/repository" \
  -v "$SOURCE_DIR:/input:ro" \
  "$RESTIC_IMAGE" -r /repository backup /input \
  --host sovrack-vps --tag sovrack-postgres

restic forget --host sovrack-vps --tag sovrack-postgres \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic check

# Restic prend un verrou même pour restore ; le dépôt reste inscriptible
# uniquement afin de créer puis retirer ce verrou de cohérence.
docker run --rm \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  -e RESTIC_PASSWORD_FILE=/run/secrets/restic-password \
  -v "$PASSWORD_FILE:/run/secrets/restic-password:ro" \
  -v "$REPOSITORY:/repository" \
  -v "$RESTORE_DIR:/restore" \
  "$RESTIC_IMAGE" -r /repository restore latest:/input \
  --host sovrack-vps --tag sovrack-postgres --target /restore

restored_dump="$(find "$RESTORE_DIR" -type f -name 'sovrack-*.sql.gz' -print -quit)"
[ -n "$restored_dump" ] \
  && [ -f "$restored_dump.sha256" ] \
  && [ -f "$restored_dump.metadata" ]
(cd "$(dirname "$restored_dump")" \
  && sha256sum -c "$(basename "$restored_dump").sha256")
gzip -t "$restored_dump"

echo "Encrypted off-VPS backup and restore verification passed."
