#!/bin/sh
set -eu

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

# Ne remplace que DOMAIN ; les variables natives nginx ($host, $uri, etc.)
# doivent rester intactes dans la configuration générée.
envsubst '${DOMAIN}' < "$template" > "$target"
nginx -t
exec nginx -g 'daemon off;'
