#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEST_PROJECT="sovrack-scripts-test"
COMPOSE_FILE="$ROOT/tests/docker-compose.scripts-test.yml"
ENV_FILE="$ROOT/.env.production.example"
export COMPOSE_FILE ENV_FILE

if docker ps -a --filter "label=com.docker.compose.project=$TEST_PROJECT" \
  --format '{{.ID}}' | grep -q .; then
  echo "Refus : le projet Docker de test existe déjà."
  exit 1
fi

TEST_BACKUP_DIR="$(mktemp -d)"
case "$TEST_BACKUP_DIR" in
  /tmp/tmp.*) ;;
  *) echo "Répertoire temporaire inattendu : $TEST_BACKUP_DIR"; exit 1 ;;
esac

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  find "$TEST_BACKUP_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEST_BACKUP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

compose up -d --wait postgres
compose exec -T postgres psql -v ON_ERROR_STOP=1 -U backup_test -d backup_test \
  -c "CREATE TABLE restore_probe(value text NOT NULL); INSERT INTO restore_probe VALUES ('before-backup');" \
  >/dev/null

BACKUP_DIR="$TEST_BACKUP_DIR" ./scripts/backup.sh
SOURCE_DUMP="$(find "$TEST_BACKUP_DIR" -maxdepth 1 -name 'sovrack-*.sql.gz' -type f | sort | sed -n '1p')"
[ -n "$SOURCE_DUMP" ]
(cd "$TEST_BACKUP_DIR" && sha256sum -c "$(basename "$SOURCE_DUMP").sha256") >/dev/null

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U backup_test -d backup_test \
  -c "UPDATE restore_probe SET value='after-backup';" >/dev/null

RESTORE_CONFIRM=backup_test BACKUP_DIR="$TEST_BACKUP_DIR" \
  ./scripts/restore.sh "$SOURCE_DUMP"

restored_value="$(compose exec -T postgres psql -At -U backup_test -d backup_test -c 'SELECT value FROM restore_probe;')"
[ "$restored_value" = "before-backup" ]

echo "Backup/restore integration test passed."
