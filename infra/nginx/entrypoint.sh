#!/bin/sh
set -eu

APP_DOMAIN="${APP_DOMAIN:-app.${DOMAIN}}"
STAFF_DOMAIN="${STAFF_DOMAIN:-staff.${DOMAIN}}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.${DOMAIN}}"
export APP_DOMAIN STAFF_DOMAIN STAGING_DOMAIN

certificate_dir="/etc/letsencrypt/live/${DOMAIN}"
tls_template="/etc/nginx/proxy.conf.template"
http_template="/etc/nginx/acme-http.conf.template"
target="/etc/nginx/conf.d/default.conf"

if [ -s "${certificate_dir}/fullchain.pem" ] && [ -s "${certificate_dir}/privkey.pem" ]; then
  template="$tls_template"
  echo "Sovrack nginx: certificat présent, activation HTTPS."
else
  template="$http_template"
  echo "Sovrack nginx: certificat absent, mode bootstrap HTTP/ACME."
fi

# Ne remplace que les domaines ; les variables natives nginx ($host, $uri,
# etc.) doivent rester intactes dans la configuration générée.
envsubst '${DOMAIN} ${APP_DOMAIN} ${STAFF_DOMAIN} ${STAGING_DOMAIN}' < "$template" > "$target"
nginx -t
exec nginx -g 'daemon off;'
