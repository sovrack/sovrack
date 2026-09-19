#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="sovrack-nginx-maintenance-test"
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Refus : le conteneur $CONTAINER existe déjà."
  exit 1
fi
TEMP_DIR="$(mktemp -d)"
cleanup() {
  docker stop "$CONTAINER" >/dev/null 2>&1 || true
  find "$TEMP_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$TEMP_DIR/certs" "$TEMP_DIR/maintenance"
chmod 755 "$TEMP_DIR/maintenance"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=example.test' \
  -keyout "$TEMP_DIR/certs/privkey.pem" \
  -out "$TEMP_DIR/certs/fullchain.pem" >/dev/null 2>&1

# mktemp crée 0700. Dans la CI, le daemon Docker rootless (UID 1000) vit dans
# un service séparé et doit pouvoir traverser le volume /builds partagé. Les
# fichiers concernés sont uniquement un certificat autosigné jetable et un
# marqueur de maintenance vide.
chmod 755 "$TEMP_DIR" "$TEMP_DIR/certs" "$TEMP_DIR/maintenance"
if [ -n "${DIND_SHARED_UID:-}" ]; then
  chown -R "$DIND_SHARED_UID:${DIND_SHARED_GID:-$DIND_SHARED_UID}" \
    "$TEMP_DIR/certs" "$TEMP_DIR/maintenance"
fi

docker run --rm -d --name "$CONTAINER" -e DOMAIN=example.test \
  -e APP_DOMAIN=app.example.test -e STAFF_DOMAIN=staff.example.test \
  -v "$ROOT/nginx/proxy.conf.template:/etc/nginx/proxy.conf.template:ro" \
  -v "$ROOT/nginx/acme-http.conf.template:/etc/nginx/acme-http.conf.template:ro" \
  -v "$ROOT/nginx/entrypoint.sh:/opt/sovrack/nginx-entrypoint.sh:ro" \
  -v "$ROOT/nginx/security-headers.conf:/etc/nginx/conf.d/security-headers.conf:ro" \
  -v "$TEMP_DIR/certs:/etc/letsencrypt/live/example.test:ro" \
  -v "$TEMP_DIR/maintenance:/var/run/sovrack-maintenance:ro" \
  --entrypoint /bin/sh nginx:1.27-alpine \
  /opt/sovrack/nginx-entrypoint.sh >/dev/null

for _attempt in $(seq 1 20); do
  if docker exec "$CONTAINER" nginx -t >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" nginx -t
test "$(stat -c %a "$TEMP_DIR/maintenance")" = "755"
docker exec --user 101 "$CONTAINER" sh -c \
  'ls -la /var/run/sovrack-maintenance >/dev/null'
nginx_dump="$(docker exec "$CONTAINER" nginx -T 2>&1)"
printf '%s\n' "$nginx_dump" | grep -q 'zone=sovrack_api:10m rate=20r/s'
printf '%s\n' "$nginx_dump" | grep -q 'zone=sovrack_auth:10m rate=5r/m'
printf '%s\n' "$nginx_dump" | grep -q 'limit_conn sovrack_connections 50'
touch "$TEMP_DIR/maintenance/enabled"
response_headers="$(docker exec "$CONTAINER" wget --no-check-certificate -qSO- \
  --header='Host: example.test' https://127.0.0.1/ 2>&1 >/dev/null || true)"
printf '%s\n' "$response_headers" | grep -q '503 Service Temporarily Unavailable'

echo "Nginx standalone maintenance test passed."
