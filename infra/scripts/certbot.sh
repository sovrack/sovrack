#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# =============================================================================
# Sovrack — Obtention / renouvellement du certificat TLS (Let's Encrypt / certbot)
# -----------------------------------------------------------------------------
# Utilise un conteneur certbot éphémère qui écrit dans le volume "certbot-certs"
# du stack (monter par nginx). Reload nginx après.
#
# Usage :
#   DOMAIN=sovrack.com ./scripts/certbot.sh [email]           # obtention
#   DOMAIN=sovrack.com ./scripts/certbot.sh [email] --renew   # renouvellement
# =============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=release-lib.sh
source "$ROOT/scripts/release-lib.sh"
cd "$ROOT"
export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
if [ -n "${ENV_FILE:-}" ]; then
  secrets_env="$ENV_FILE"
elif [ -f "$BASE_DIR/shared/.env" ]; then
  secrets_env="$BASE_DIR/shared/.env"
else
  secrets_env="$ROOT/.env"
fi
[ -f "$secrets_env" ] || { echo "❌ fichier de secrets introuvable."; exit 1; }
env_value() {
  awk -F= -v wanted="$1" '$1 == wanted { sub(/^[^=]*=/, ""); print }' "$secrets_env"
}

DOMAIN="${DOMAIN:-$(env_value DOMAIN)}"
EMAIL="${CERTBOT_EMAIL:-$(env_value CERTBOT_EMAIL)}"
EMAIL="${EMAIL:-contact@sovrack.com}"
CERTBOT_IMAGE="${CERTBOT_IMAGE:-$(env_value CERTBOT_IMAGE)}"
CERTBOT_IMAGE="${CERTBOT_IMAGE:-certbot/certbot@sha256:34ee91d2f43008eb78a007d22f23ed4b2eaa9a454cb27ca2c042b49527a695b4}"
APP_DOMAIN="${APP_DOMAIN:-$(env_value APP_DOMAIN)}"
STAFF_DOMAIN="${STAFF_DOMAIN:-$(env_value STAFF_DOMAIN)}"
CERTBOT_DOMAINS="${CERTBOT_DOMAINS:-$(env_value CERTBOT_DOMAINS)}"
if [ -z "$CERTBOT_DOMAINS" ]; then
  CERTBOT_DOMAINS="$DOMAIN,www.$DOMAIN"
  [ -n "$APP_DOMAIN" ] && [ "$APP_DOMAIN" != "$DOMAIN" ] && CERTBOT_DOMAINS="$CERTBOT_DOMAINS,$APP_DOMAIN"
  [ -n "$STAFF_DOMAIN" ] && [ "$STAFF_DOMAIN" != "$DOMAIN" ] && CERTBOT_DOMAINS="$CERTBOT_DOMAINS,$STAFF_DOMAIN"
fi
RENEW=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --renew) RENEW=1 ;;
    --dry-run) RENEW=1; DRY_RUN=1 ;;
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
is_immutable_image "$CERTBOT_IMAGE" && [[ "$CERTBOT_IMAGE" == *@sha256:* ]] || {
  echo "❌ CERTBOT_IMAGE doit utiliser un digest sha256 immuable."
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
docker compose --env-file "$secrets_env" up -d --wait --wait-timeout 120 nginx

if [ "$RENEW" -eq 1 ]; then
  renew_args=(renew --webroot --webroot-path /var/www/certbot --non-interactive)
  if [ "$DRY_RUN" -eq 1 ]; then
    renew_args+=(--dry-run)
  fi
  docker run --rm \
    -v "$WEBROOT_VOLUME:/var/www/certbot" \
    -v "$CERT_VOLUME:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" \
    "${renew_args[@]}"
else
  domain_args=()
  IFS=',' read -r -a requested_domains <<< "$CERTBOT_DOMAINS"
  for requested_domain in "${requested_domains[@]}"; do
    requested_domain="${requested_domain//[[:space:]]/}"
    [[ "$requested_domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || {
      echo "❌ Domaine Certbot invalide."
      exit 1
    }
    domain_args+=(--domains "$requested_domain")
  done
  [ "${#domain_args[@]}" -gt 0 ] || { echo "❌ CERTBOT_DOMAINS est vide."; exit 1; }
  docker run --rm \
    -v "$WEBROOT_VOLUME:/var/www/certbot" \
    -v "$CERT_VOLUME:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" \
    certonly --webroot --webroot-path /var/www/certbot \
    --agree-tos --no-eff-email --non-interactive --expand \
    --cert-name "$DOMAIN" --email "$EMAIL" "${domain_args[@]}"
fi

# Une recréation repasse par l'entrypoint, détecte le certificat et active la
# configuration 443. Un simple reload conserverait le template HTTP initial.
docker compose --env-file "$secrets_env" up -d --force-recreate --wait --wait-timeout 120 nginx

echo "✅ Certificat installé pour $DOMAIN."
