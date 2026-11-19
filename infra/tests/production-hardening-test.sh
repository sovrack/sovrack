#!/usr/bin/env bash
# Runtime qualification of the production security controls with disposable data.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_COMPOSE="$ROOT/docker-compose.prod.yml"
TEST_COMPOSE="$ROOT/tests/docker-compose.hardening-test.yml"
TEST_PROJECT="sovrack-hardening-test"
TEMP_DIR="$(mktemp -d)"
ENV_FILE="$TEMP_DIR/test.env"
CERT_DIR="$TEMP_DIR/certs"
MAINTENANCE_DIR="$TEMP_DIR/maintenance"
HARDENING_BIND_ADDRESS="127.0.0.1"
HARDENING_PROBE_HOST="127.0.0.1"

# Avec un daemon distant (DinD), le port publié appartient au service Docker et
# non au conteneur du job. Le bind 0.0.0.0 reste confiné au réseau jetable du
# job, et la sonde vise le nom d'hôte extrait de DOCKER_HOST.
if [[ "${DOCKER_HOST:-}" == tcp://* ]]; then
  docker_host_authority="${DOCKER_HOST#tcp://}"
  HARDENING_BIND_ADDRESS="0.0.0.0"
  HARDENING_PROBE_HOST="${docker_host_authority%%:*}"
fi

cleanup() {
  if [ "${KEEP_HARDENING_STACK:-false}" = "true" ]; then
    echo "Hardening test stack preserved for diagnostics."
    return
  fi
  docker compose --env-file "$ENV_FILE" -p "$TEST_PROJECT" \
    -f "$BASE_COMPOSE" -f "$TEST_COMPOSE" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
  find "$TEMP_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

for key in BACKEND_IMAGE FRONTEND_IMAGE NGINX_IMAGE POSTGRES_IMAGE REDIS_IMAGE; do
  [ -n "${!key:-}" ] || {
    echo "ERROR: $key doit référencer l'image immuable à qualifier."
    exit 1
  }
done

mkdir -p "$CERT_DIR" "$MAINTENANCE_DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=hardening.test' \
  -keyout "$CERT_DIR/privkey.pem" -out "$CERT_DIR/fullchain.pem" \
  >/dev/null 2>&1

# Autorise uniquement le daemon DinD rootless à traverser les fixtures
# éphémères montées en lecture seule. Les secrets et certificats de production
# ne passent jamais par ce test.
chmod 755 "$TEMP_DIR" "$CERT_DIR" "$MAINTENANCE_DIR"
if [ -n "${DIND_SHARED_UID:-}" ]; then
  chown -R "$DIND_SHARED_UID:${DIND_SHARED_GID:-$DIND_SHARED_UID}" \
    "$CERT_DIR" "$MAINTENANCE_DIR"
fi

cat > "$ENV_FILE" <<EOF
DOMAIN=hardening.test
APP_DOMAIN=app.hardening.test
STAFF_DOMAIN=staff.hardening.test
PUBLIC_SITE_URL=https://hardening.test
CUSTOMER_APP_URL=https://app.hardening.test
STAFF_APP_URL=https://staff.hardening.test
FRONTEND_PUBLIC_URL=https://hardening.test
FRONTEND_WS_PUBLIC_URL=wss://hardening.test
POSTGRES_USER=sovrack_test
POSTGRES_PASSWORD=hardening-postgres-password-000000
POSTGRES_DB=sovrack_test
REDIS_PASSWORD=hardening-redis-password-000000000
JWT_SECRET=hardening-jwt-secret-000000000000000000000000000000
STAFF_JWT_SECRET=hardening-staff-jwt-secret-00000000000000000000000
STAFF_OTP_SECRET=hardening-staff-otp-secret-00000000000000000000000
CUSTOMER_MFA_SECRET=hardening-customer-mfa-secret-00000000000000000000
CONFIG_SECRET=hardening-config-secret-00000000000000000000000000
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$FRONTEND_IMAGE
NGINX_IMAGE=$NGINX_IMAGE
POSTGRES_IMAGE=$POSTGRES_IMAGE
REDIS_IMAGE=$REDIS_IMAGE
HARDENING_CERT_DIR=$CERT_DIR
HARDENING_MAINTENANCE_DIR=$MAINTENANCE_DIR
HARDENING_BIND_ADDRESS=$HARDENING_BIND_ADDRESS
EOF

compose=(docker compose --env-file "$ENV_FILE" -p "$TEST_PROJECT" \
  -f "$BASE_COMPOSE" -f "$TEST_COMPOSE")

"${compose[@]}" config -q
"${compose[@]}" up -d --wait postgres redis
"${compose[@]}" run --rm migrator
"${compose[@]}" up -d --wait backend frontend nginx

for container in \
  sovrack-hardening-nginx sovrack-hardening-frontend \
  sovrack-hardening-backend sovrack-hardening-postgres \
  sovrack-hardening-redis; do
  [ "$(docker inspect "$container" --format '{{.HostConfig.ReadonlyRootfs}}')" = "true" ]
  docker inspect "$container" --format '{{json .HostConfig.SecurityOpt}}' \
    | grep -q 'no-new-privileges'
  docker inspect "$container" --format '{{json .HostConfig.CapDrop}}' \
    | grep -q 'ALL'
  [ "$(docker inspect "$container" --format '{{.HostConfig.PidsLimit}}')" -gt 0 ]
done

headers="$(curl -ksS -D - -o /dev/null \
  -H 'Host: hardening.test' "https://$HARDENING_PROBE_HOST:18443/backend-api/health")"
for header in x-content-type-options x-frame-options referrer-policy \
  permissions-policy strict-transport-security; do
  [ "$(printf '%s\n' "$headers" | grep -ci "^${header}:")" -eq 1 ] || {
    echo "ERROR: l'en-tête $header doit être présent exactement une fois."
    exit 1
  }
done

rate_limited=false
for _attempt in $(seq 1 12); do
  status="$(curl -ksS -o /dev/null -w '%{http_code}' \
    -H 'Host: app.hardening.test' -H 'Content-Type: application/json' \
    -d '{}' "https://$HARDENING_PROBE_HOST:18443/backend-api/auth/login")"
  if [ "$status" = "429" ]; then
    rate_limited=true
    break
  fi
done
[ "$rate_limited" = "true" ] || {
  echo "ERROR: la limite de débit d'authentification n'a pas produit de 429."
  exit 1
}

echo "Production container hardening and Nginx controls passed."
