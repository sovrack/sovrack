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
  -c 'CREATE TABLE restore_probe(value text NOT NULL); INSERT INTO restore_probe VALUES ('\''before-backup'\''); CREATE TABLE "_prisma_migrations" (migration_name text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz); INSERT INTO "_prisma_migrations" VALUES ('\''20260818120000_phase2_security_invariants'\'', CURRENT_TIMESTAMP, NULL);' \
  >/dev/null

RELEASE_MANIFEST="$TEST_BACKUP_DIR/test-release.manifest"
infra_commit="$(git rev-parse HEAD)"
{
  printf 'RELEASE_ID=test-release\n'
  printf 'BACKEND_IMAGE=registry.example/backend:%040d\n' 0
  printf 'FRONTEND_IMAGE=registry.example/frontend:%040d\n' 1
  printf 'NGINX_IMAGE=nginx@sha256:%064d\n' 4
  printf 'POSTGRES_IMAGE=postgres@sha256:%064d\n' 5
  printf 'REDIS_IMAGE=redis@sha256:%064d\n' 6
  printf 'BACKEND_COMMIT=%040d\n' 0
  printf 'FRONTEND_COMMIT=%040d\n' 1
  printf 'INFRA_COMMIT=%s\n' "$infra_commit"
  printf 'RUNTIME_TOPOLOGY=compact\n'
  printf 'SCHEMA_MIGRATION=20260818120000_phase2_security_invariants\n'
  printf 'OPENAPI_SHA256=%064d\n' 2
} > "$RELEASE_MANIFEST"

BACKUP_DIR="$TEST_BACKUP_DIR" RELEASE_FILE="$RELEASE_MANIFEST" ./scripts/backup.sh
SOURCE_DUMP="$(find "$TEST_BACKUP_DIR" -maxdepth 1 -name 'sovrack-*.sql.gz' -type f | sort | sed -n '1p')"
[ -n "$SOURCE_DUMP" ]
(cd "$TEST_BACKUP_DIR" && sha256sum -c "$(basename "$SOURCE_DUMP").sha256") >/dev/null

compose exec -T postgres psql -v ON_ERROR_STOP=1 -U backup_test -d backup_test \
  -c "UPDATE restore_probe SET value='after-backup';" >/dev/null

RESTORE_CONFIRM=backup_test BACKUP_DIR="$TEST_BACKUP_DIR" \
  SOVRACK_BASE_DIR="$TEST_BACKUP_DIR/base" SOVRACK_SKIP_ACTIVATION=true \
  ./scripts/restore.sh "$SOURCE_DUMP" --release-file "$RELEASE_MANIFEST" --mode exact

restored_value="$(compose exec -T postgres psql -At -U backup_test -d backup_test -c 'SELECT value FROM restore_probe;')"
[ "$restored_value" = "before-backup" ]

echo "Backup/restore integration test passed."
