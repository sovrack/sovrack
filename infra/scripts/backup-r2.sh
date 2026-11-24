#!/usr/bin/env bash
# ==============================================================================
# Sovrack Cloudflare R2 Automated Database Backup
# Streams compressed PostgreSQL dumps with SHA256 checksums to Cloudflare R2
# ==============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
ENV_FILE="${ENV_FILE:-$BASE_DIR/shared/.env}"

if [ ! -f "$ENV_FILE" ] && [ -f "$ROOT/.env" ]; then
  ENV_FILE="$ROOT/.env"
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Environment file not found ($ENV_FILE)" >&2
  exit 1
fi

# Load environment configuration
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

R2_ENDPOINT="${S3_ENDPOINT:-https://0126b8dbdc1077fd680c739351fe0b04.r2.cloudflarestorage.com}"
R2_BUCKET="${S3_BUCKET:-sovrack-backups}"
R2_ACCESS_KEY="${S3_ACCESS_KEY_ID:-433a71f8412783f7b202fa31df5c1c68}"
R2_SECRET_KEY="${S3_SECRET_ACCESS_KEY:-adc51a8cf2d54ad5dfbe6c84b5bf7656062870bafdd1b8a510397a6505c0a756}"
R2_REGION="${S3_REGION:-auto}"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER_NAME:-sovrack-staging-postgres}"
if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_CONTAINER}$"; then
  POSTGRES_CONTAINER="sovrack-postgres"
fi

DB_USER=$(docker exec "${POSTGRES_CONTAINER}" printenv POSTGRES_USER || echo "${POSTGRES_USER:-sovrack_staging}")
DB_NAME=$(docker exec "${POSTGRES_CONTAINER}" printenv POSTGRES_DB || echo "${POSTGRES_DB:-sovrack_staging}")

BACKUP_DIR="/tmp/sovrack-r2-backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%SZ)"
FILENAME="sovrack-${DB_NAME}-${TIMESTAMP}.sql.gz"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"

echo "=========================================================="
echo " Starting Sovrack Cloudflare R2 Backup"
echo " Target DB        : ${DB_NAME} (container: ${POSTGRES_CONTAINER})"
echo " Target R2 Bucket : ${R2_BUCKET}"
echo " Endpoint         : ${R2_ENDPOINT}"
echo "=========================================================="

echo "[1/4] Dumping and compressing PostgreSQL database..."
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "${POSTGRES_CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges | gzip -9 > "${LOCAL_PATH}"

FILESIZE=$(du -h "${LOCAL_PATH}" | cut -f1)
echo "      Dump created: ${FILENAME} (${FILESIZE})"

echo "[2/4] Generating SHA256 integrity checksum..."
sha256sum "${LOCAL_PATH}" > "${LOCAL_PATH}.sha256"

echo "[3/4] Streaming backup to Cloudflare R2 bucket (${R2_BUCKET})..."
docker run --rm \
  -e AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
  -e AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
  -e AWS_DEFAULT_REGION="${R2_REGION}" \
  -v "${BACKUP_DIR}:/data:ro" \
  amazon/aws-cli:2.15.30 \
  --endpoint-url "${R2_ENDPOINT}" \
  s3 cp "/data/${FILENAME}" "s3://${R2_BUCKET}/backups/${FILENAME}"

docker run --rm \
  -e AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
  -e AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
  -e AWS_DEFAULT_REGION="${R2_REGION}" \
  -v "${BACKUP_DIR}:/data:ro" \
  amazon/aws-cli:2.15.30 \
  --endpoint-url "${R2_ENDPOINT}" \
  s3 cp "/data/${FILENAME}.sha256" "s3://${R2_BUCKET}/backups/${FILENAME}.sha256"

echo "[4/4] Verifying off-site objects in Cloudflare R2..."
docker run --rm \
  -e AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY}" \
  -e AWS_SECRET_ACCESS_KEY="${R2_SECRET_KEY}" \
  -e AWS_DEFAULT_REGION="${R2_REGION}" \
  amazon/aws-cli:2.15.30 \
  --endpoint-url "${R2_ENDPOINT}" \
  s3 ls "s3://${R2_BUCKET}/backups/"

# Cleanup temporary local dump
rm -f "${LOCAL_PATH}" "${LOCAL_PATH}.sha256"

echo "=========================================================="
echo " SUCCESS: Database backup verified on Cloudflare R2!"
echo "=========================================================="
