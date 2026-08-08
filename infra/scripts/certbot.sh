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

DOMAIN="${DOMAIN:-sovrack.tech}"
EMAIL="${CERTBOT_EMAIL:-admin@sovrack.tech}"
RENEW=0
for arg in "$@"; do
  case "$arg" in
    --renew) RENEW=1 ;;
    *) EMAIL="$arg" ;;
  esac
done
CERT_VOLUME="sovrack-certbot-certs"
WEBROOT_VOLUME="sovrack-certbot-webroot"

echo "▶️  Certbot TLS pour $DOMAIN (email : $EMAIL)${RENEW:+, mode renouvellement}"

# 1. Démarre nginx (sert le challenge ACME-READ)
docker compose -f docker-compose.prod.yml up -d nginx
sleep 3

# 2. certbot (en utilisant l'ACME challenge webroot monté)
#    --force-renewal : renouvelle même si le certificat n'est pas expirant
#    (pratique pour tester la chaîne de renouvellement).
CERTBOT_ARGS=()
if [ "$RENEW" -eq 1 ]; then CERTBOT_ARGS+=(--force-renewal); fi
docker run --rm \
  -v "$WEBROOT_VOLUME:/var/www/certbot" \
  -v "$CERT_VOLUME:/etc/letsencrypt" \
  --network host \
  certbot/certbot:latest \
  certonly --webroot -w /var/www/certbot \
  --agree-tos --no-eff-email -m "$EMAIL" -d "$DOMAIN" \
  "${CERTBOT_ARGS[@]}"

# 3. Reload nginx
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload

echo "✅ Certificat installé pour $DOMAIN."