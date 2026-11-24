#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
# =============================================================================
# Sovrack — Génération de certificat TLS autosigné pour qualification Staging / Local
# -----------------------------------------------------------------------------
# Ce script crée un certificat autosigné SAN (Subject Alternative Names) dans le
# volume Docker sovrack-certbot-certs pour permettre l'évaluation TLS complète
# sur une VM de qualification (ex: VMware staging IP ou domaine interne)
# lorsque Let's Encrypt ne peut pas valider de challenge public.
#
# Usage :
#   ./scripts/gen-self-signed-certs.sh
# =============================================================================
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_DIR="${SOVRACK_BASE_DIR:-$ROOT}"
# shellcheck source=release-lib.sh
source "$SCRIPT_DIR/release-lib.sh"

SECRETS_ENV="$(resolve_secrets_env "$ROOT" "$BASE_DIR")"
[ -f "$SECRETS_ENV" ] || { echo "ERROR: fichier de secrets introuvable : $SECRETS_ENV"; exit 1; }

domain="$(read_env_value DOMAIN "$SECRETS_ENV")"
app_domain="$(read_env_value APP_DOMAIN "$SECRETS_ENV")"
staff_domain="$(read_env_value STAFF_DOMAIN "$SECRETS_ENV")"
staging_domain="$(read_env_value STAGING_DOMAIN "$SECRETS_ENV")"
allow_self_signed="$(read_env_value ALLOW_SELF_SIGNED_TLS "$SECRETS_ENV")"

if [ "${allow_self_signed:-false}" != "true" ]; then
  echo "WARNING: ALLOW_SELF_SIGNED_TLS n'est pas activé dans $SECRETS_ENV."
  echo "         Pour utiliser un certificat autosigné en qualification, activez ALLOW_SELF_SIGNED_TLS=true."
fi

CERT_VOLUME="sovrack-certbot-certs"
CERT_DIR="/etc/letsencrypt/live/${domain}"

echo "🔐 Génération d'un certificat TLS autosigné pour :"
echo "   - DOMAIN       : ${domain}"
echo "   - APP_DOMAIN   : ${app_domain}"
echo "   - STAFF_DOMAIN : ${staff_domain}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

OPENSSL_CNF="$TMP_DIR/openssl.cnf"
cat <<EOF > "$OPENSSL_CNF"
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
CN = ${domain}
O = Sovrack Staging
OU = Infrastructure
C = FR

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${domain}
DNS.2 = www.${domain}
DNS.3 = ${app_domain}
DNS.4 = ${staff_domain}
DNS.5 = ${staging_domain:-staging.sovrack.com}
IP.1  = 127.0.0.1
EOF

# Ajouter l'IP si le domaine est une IPv4
if [[ "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "IP.2  = ${domain}" >> "$OPENSSL_CNF"
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$TMP_DIR/privkey.pem" \
  -out "$TMP_DIR/fullchain.pem" \
  -config "$OPENSSL_CNF" >/dev/null 2>&1

# S'assurer que le volume Docker existe
docker volume create "$CERT_VOLUME" >/dev/null

# Injection sécurisée dans le volume Docker via conteneur éphémère
docker run --rm \
  -v "$CERT_VOLUME:/etc/letsencrypt" \
  -v "$TMP_DIR:/certs_src:ro" \
  alpine:latest sh -c "
    mkdir -p '${CERT_DIR}' &&
    cp /certs_src/fullchain.pem '${CERT_DIR}/fullchain.pem' &&
    cp /certs_src/privkey.pem '${CERT_DIR}/privkey.pem' &&
    chmod 700 '${CERT_DIR}' &&
    chmod 600 '${CERT_DIR}/fullchain.pem' '${CERT_DIR}/privkey.pem' &&
    echo 'Certificats copiés dans le volume avec succès.'
  "

echo "✅ Certificat autosigné installé avec succès dans le volume ${CERT_VOLUME} (${CERT_DIR})."
