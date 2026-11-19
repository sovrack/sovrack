#!/usr/bin/env bash
# Create/invite the first ROOT through a one-shot container. The first password
# is chosen by its owner after receiving a short-lived email activation code.
set -euo pipefail
umask 077

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
EMAIL="${1:-${STAFF_BOOTSTRAP_EMAIL:-}}"

usage() {
  echo "Usage: $0 <root-email>"
  echo "Un code d'activation sera envoyé par la configuration SMTP de production."
}

[[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  usage
  exit 1
}

CURRENT="$(realpath "$BASE_DIR/current")"
case "$CURRENT" in
  "$BASE_DIR"/releases/*) ;;
  *) echo "ERROR: current ne pointe pas vers une release versionnée."; exit 1 ;;
esac

export STAFF_ROOT_EMAIL="${EMAIL,,}"
trap 'unset STAFF_ROOT_EMAIL' EXIT

SOVRACK_BASE_DIR="$BASE_DIR" \
  "$CURRENT/scripts/current-compose.sh" --profile bootstrap run --rm --no-deps \
  -e STAFF_ROOT_EMAIL staff-bootstrap

echo "Bootstrap ROOT terminé. Consultez la boîte email puis /staff/activate."
