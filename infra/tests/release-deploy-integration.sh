#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_PROJECT="sovrack-release-test"
TEMP_DIR="$(mktemp -d)"
BASE_DIR="$TEMP_DIR/sovrack"
RELEASE_ID="test-release"
RELEASE_ROOT="$BASE_DIR/releases/$RELEASE_ID"
COMPOSE_FILE="$SOURCE_ROOT/tests/docker-compose.scripts-test.yml"
export COMPOSE_FILE COMPOSE_PROJECT_NAME="$TEST_PROJECT"

cleanup() {
  docker compose --env-file "$BASE_DIR/shared/.env" -f "$COMPOSE_FILE" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
  find "$TEMP_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$RELEASE_ROOT" "$BASE_DIR/shared"
mkdir -p "$BASE_DIR/releases/previous-release"
ln -s "$BASE_DIR/releases/previous-release" "$BASE_DIR/current"
cp -R "$SOURCE_ROOT/." "$RELEASE_ROOT/"
infra_commit="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
printf '%s\n' "$infra_commit" > "$RELEASE_ROOT/.infra-commit"

cat > "$BASE_DIR/shared/.env" <<'EOF'
DOMAIN=example.test
APP_DOMAIN=app.example.test
STAFF_DOMAIN=staff.example.test
PUBLIC_SITE_URL=https://example.test
CUSTOMER_APP_URL=https://app.example.test
STAFF_APP_URL=https://staff.example.test
POSTGRES_USER=backup_test
POSTGRES_PASSWORD=postgres-test-password-000000
POSTGRES_DB=backup_test
REDIS_PASSWORD=redis-test-password-00000000
JWT_SECRET=jwt-test-secret-000000000000000000000000000000000000
STAFF_JWT_SECRET=staff-jwt-test-secret-000000000000000000000000000000
STAFF_OTP_SECRET=staff-otp-test-secret-000000000000000000000000000000
CONFIG_SECRET=config-test-secret-00000000000000000000000000000000
STAFF_ROOT_EMAIL=staff@example.test
STAFF_ROOT_PASSWORD=staff-test-password-000000000
MIN_HOST_MEMORY_MB=1
MIN_HOST_FREE_DISK_MB=1
ALLOW_UNDERSIZED_HOST=true
ALLOW_SELF_SIGNED_TLS=false
EOF
chmod 600 "$BASE_DIR/shared/.env"

manifest="$RELEASE_ROOT/release.manifest"
{
  printf 'RELEASE_ID=%s\n' "$RELEASE_ID"
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
} > "$manifest"

docker compose --env-file "$BASE_DIR/shared/.env" -f "$COMPOSE_FILE" up -d --wait postgres
docker compose --env-file "$BASE_DIR/shared/.env" -f "$COMPOSE_FILE" \
  exec -T postgres psql -v ON_ERROR_STOP=1 -U backup_test -d backup_test \
  -c 'CREATE TABLE "_prisma_migrations" (migration_name text NOT NULL, finished_at timestamptz, rolled_back_at timestamptz); INSERT INTO "_prisma_migrations" VALUES ('\''20260818120000_phase2_security_invariants'\'', CURRENT_TIMESTAMP, NULL);' \
  >/dev/null

SOVRACK_BASE_DIR="$BASE_DIR" ENV_FILE="$BASE_DIR/shared/.env" \
  SKIP_IMAGE_PROVENANCE_CHECK=true \
  "$RELEASE_ROOT/scripts/deploy.sh" --release-file "$manifest"

[ "$(realpath "$BASE_DIR/current")" = "$(realpath "$RELEASE_ROOT")" ]
cmp -s "$manifest" "$BASE_DIR/shared/release-manifests/$RELEASE_ID.manifest"
[ ! -e "$BASE_DIR/shared/maintenance/enabled" ]
[ "$(stat -c %a "$BASE_DIR/shared/maintenance")" = "755" ]
[ "$(docker inspect sovrack-release-test-backend-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '$1 == "PROCESS_ROLE" { print $2 }')" = "all" ]
[ -z "$(docker ps -q --filter name=sovrack-release-test-worker-1)" ]
backup_metadata="$(find "$BASE_DIR/shared/backups" -maxdepth 1 -name 'sovrack-*.sql.gz.metadata' -type f | sort | sed -n '1p')"
[ -n "$backup_metadata" ]
[ "$(awk -F= '$1 == "RELEASE_ID" { print $2 }' "$backup_metadata")" = "previous-release" ]

echo "Immutable release deployment integration test passed."
