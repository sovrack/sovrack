#!/usr/bin/env bash
# Create the first ROOT through a one-shot container. The password is never
# written to the shared production dotenv file and is not placed on argv.
set -euo pipefail
umask 077

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
EMAIL="${1:-${STAFF_BOOTSTRAP_EMAIL:-}}"
PASSWORD=""

usage() {
  echo "Usage: $0 <root-email>"
  echo "Le mot de passe est demandé silencieusement, ou lu depuis STAFF_BOOTSTRAP_PASSWORD_FILE."
}

[[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || {
  usage
  exit 1
}

if [ -n "${STAFF_BOOTSTRAP_PASSWORD_FILE:-}" ]; then
  password_file="$STAFF_BOOTSTRAP_PASSWORD_FILE"
  [ -f "$password_file" ] && [ ! -L "$password_file" ] || {
    echo "ERROR: fichier de mot de passe absent ou lien symbolique refusé."
    exit 1
  }
  permissions="$(stat -c '%a' "$password_file")"
  [ "$permissions" = "600" ] || [ "$permissions" = "400" ] || {
    echo "ERROR: le fichier de mot de passe doit être en mode 600 ou 400."
    exit 1
  }
  IFS= read -r PASSWORD < "$password_file"
elif [ -t 0 ]; then
  read -r -s -p "Mot de passe initial du ROOT: " PASSWORD
  echo
  read -r -s -p "Confirmer le mot de passe: " confirmation
  echo
  [ "$PASSWORD" = "$confirmation" ] || {
    echo "ERROR: les mots de passe ne correspondent pas."
    exit 1
  }
  unset confirmation
else
  echo "ERROR: saisie interactive requise ou STAFF_BOOTSTRAP_PASSWORD_FILE absent."
  exit 1
fi

[ "${#PASSWORD}" -ge 12 ] && [ "${#PASSWORD}" -le 128 ] && \
  [[ "$PASSWORD" =~ [a-z] ]] && [[ "$PASSWORD" =~ [A-Z] ]] && \
  [[ "$PASSWORD" =~ [0-9] ]] || {
  echo "ERROR: le mot de passe doit contenir 12 à 128 caractères, une majuscule, une minuscule et un chiffre."
  exit 1
}

CURRENT="$(realpath "$BASE_DIR/current")"
case "$CURRENT" in
  "$BASE_DIR"/releases/*) ;;
  *) echo "ERROR: current ne pointe pas vers une release versionnée."; exit 1 ;;
esac

export STAFF_ROOT_EMAIL="${EMAIL,,}"
export STAFF_ROOT_PASSWORD="$PASSWORD"
trap 'unset PASSWORD STAFF_ROOT_PASSWORD STAFF_ROOT_EMAIL' EXIT

SOVRACK_BASE_DIR="$BASE_DIR" \
  "$CURRENT/scripts/current-compose.sh" --profile bootstrap run --rm --no-deps \
  -e STAFF_ROOT_EMAIL -e STAFF_ROOT_PASSWORD staff-bootstrap

echo "Bootstrap ROOT terminé. Le mot de passe n'a pas été persisté par l'infrastructure."
