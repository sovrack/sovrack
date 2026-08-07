#!/usr/bin/env bash
# =============================================================================
# Sovrack — Obtention du certificat TLS (Let's Encrypt / certbot)
# -----------------------------------------------------------------------------
# Utilise un conteneur certbot éphémère qui écrit dans le volume "certbot-certs"
# du stack (monter par nginx). Reload nginx après.
#
# Usage : DOMAIN=sovrack.tn ./scripts/certbot.sh [email]
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-${1:-sovrack.tn}}"
EMAIL="${2:-admin@sovrack.tn}"
CERT_VOLUME="sovrack-certbot-certs"
WEBROOT_VOLUME="sovrack-certbot-webroot"

echo "▶️  Certbot TLS pour $DOMAIN (email : $EMAIL)"

# 1. Démarre nginx (sert le challenge ACME-READ)
docker compose -f docker-compose.prod.yml up -d nginx
sleep 3

# 2. certbot (en utilisant l'ACME challenge webroot monté)
docker run --rm \
  -v "$WEBROOT_VOLUME:/var/www/certbot" \
  -v "$CERT_VOLUME:/etc/letsencrypt" \
  --network host \
  certbot/certbot:latest \
  certonly --webroot -w /var/www/certbot \
  --agree-tos --no-eff-email -m "$EMAIL" -d "$DOMAIN"

# 3. Reload nginx
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload

echo "✅ Certificat installé pour $DOMAIN."
echo "   Renouvellement : cron (ex. 1er de mois) → même script avec --renew."