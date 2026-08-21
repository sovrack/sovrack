#!/usr/bin/env bash
# =============================================================================
# Sovrack — Obtention / renouvellement du certificat TLS (Let's Encrypt / certbot)
# -----------------------------------------------------------------------------
# Utilise un conteneur certbot éphémère qui écrit dans le volume "certbot-certs"
# du stack (monter par nginx). Reload nginx après.
#
# Usage :
#   DOMAIN=sovrack.tech ./scripts/certbot.sh [email]           # obtention
#   DOMAIN=sovrack.tech ./scripts/certbot.sh [email] --renew   # renouvellement
# =============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

[ -f .env ] || { echo "❌ .env introuvable."; exit 1; }
env_value() {
  awk -F= -v wanted="$1" '$1 == wanted { sub(/^[^=]*=/, ""); print }' .env
}

DOMAIN="${DOMAIN:-$(env_value DOMAIN)}"
EMAIL="${CERTBOT_EMAIL:-$(env_value CERTBOT_EMAIL)}"
EMAIL="${EMAIL:-admin@sovrack.tech}"
CERTBOT_IMAGE="${CERTBOT_IMAGE:-$(env_value CERTBOT_IMAGE)}"
CERTBOT_IMAGE="${CERTBOT_IMAGE:-certbot/certbot:v5.7.0}"
RENEW=0
for arg in "$@"; do
  case "$arg" in
    --renew) RENEW=1 ;;
    *) EMAIL="$arg" ;;
  esac
done
CERT_VOLUME="sovrack-certbot-certs"
WEBROOT_VOLUME="sovrack-certbot-webroot"

[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || {
  echo "❌ Domaine invalide : $DOMAIN"
  exit 1
}
[[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || {
  echo "❌ Adresse email Certbot invalide."
  exit 1
}
if [ "$RENEW" -eq 1 ]; then
  mode="renouvellement"
else
  mode="obtention initiale"
fi
echo "▶️  Certbot TLS pour $DOMAIN (email : $EMAIL, $mode)"

# Nginx sert le challenge même sans certificat grâce à sa configuration de
# bootstrap HTTP. Les volumes ont des noms explicites dans Compose.
docker compose --env-file .env up -d --wait --wait-timeout 120 nginx

if [ "$RENEW" -eq 1 ]; then
  docker run --rm \
    -v "$WEBROOT_VOLUME:/var/www/certbot" \
    -v "$CERT_VOLUME:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" \
    renew --webroot --webroot-path /var/www/certbot \
    --non-interactive
else
  docker run --rm \
    -v "$WEBROOT_VOLUME:/var/www/certbot" \
    -v "$CERT_VOLUME:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" \
    certonly --webroot --webroot-path /var/www/certbot \
    --agree-tos --no-eff-email --non-interactive \
    --cert-name "$DOMAIN" --email "$EMAIL" --domains "$DOMAIN"
fi

# Une recréation repasse par l'entrypoint, détecte le certificat et active la
# configuration 443. Un simple reload conserverait le template HTTP initial.
docker compose --env-file .env up -d --force-recreate --wait --wait-timeout 120 nginx

echo "✅ Certificat installé pour $DOMAIN."
