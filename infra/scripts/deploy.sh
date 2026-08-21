#!/usr/bin/env bash
# =============================================================================
# Sovrack — Déploiement de la stack de production
# -----------------------------------------------------------------------------
# Pull les dernières images du registry + (re)crée les services.
# Utilisé par la CI ou à la main sur le VPS.
# =============================================================================
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export COMPOSE_FILE="${COMPOSE_FILE:-${ROOT}/docker-compose.prod.yml}"

echo "▶️  Sovrack deploy — $(date)"
[ -f .env ] || { echo "❌ .env introuvable. Lance ./scripts/bootstrap.sh d'abord."; exit 1; }

RELEASE_FILE=""
if [ "${1:-}" = "--release-file" ] && [ -n "${2:-}" ] && [ -z "${3:-}" ]; then
  RELEASE_FILE="$2"
elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--release-file <fichier>]"
  exit 1
fi

candidate_env=""
rollback_env=""
cleanup() {
  [ -z "$candidate_env" ] || rm -f -- "$candidate_env"
  [ -z "$rollback_env" ] || rm -f -- "$rollback_env"
}
trap cleanup EXIT

read_env_value() {
  local key="$1"
  local file="$2"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print }' "$file"
}

write_release_env() {
  local source_file="$1"
  local target_file="$2"
  local backend_image="$3"
  local frontend_image="$4"

  [ "$(grep -c '^BACKEND_IMAGE=' "$source_file" || true)" -eq 1 ] || {
    echo "❌ .env doit contenir exactement une ligne BACKEND_IMAGE."
    return 1
  }
  [ "$(grep -c '^FRONTEND_IMAGE=' "$source_file" || true)" -eq 1 ] || {
    echo "❌ .env doit contenir exactement une ligne FRONTEND_IMAGE."
    return 1
  }

  awk -v backend="$backend_image" -v frontend="$frontend_image" '
    /^BACKEND_IMAGE=/ { print "BACKEND_IMAGE=" backend; next }
    /^FRONTEND_IMAGE=/ { print "FRONTEND_IMAGE=" frontend; next }
    { print }
  ' "$source_file" > "$target_file"
  chmod 600 "$target_file"
}

is_immutable_image() {
  local image="$1"
  [[ "$image" =~ @sha256:[0-9a-fA-F]{64}$ || "$image" =~ :[0-9a-f]{40}$ ]]
}

# Un fichier de promotion contient uniquement deux références d'images. Il est
# volontairement parsé sans `source` afin qu'aucun contenu ne puisse exécuter
# une commande sur l'hôte.
active_env=".env"
if [ -n "$RELEASE_FILE" ]; then
  [ -f "$RELEASE_FILE" ] && [ ! -L "$RELEASE_FILE" ] || {
    echo "❌ Fichier de release absent ou lien symbolique refusé : $RELEASE_FILE"
    exit 1
  }
  mapfile -t release_lines < "$RELEASE_FILE"
  if [ "${#release_lines[@]}" -ne 2 ] \
    || [[ "${release_lines[0]}" != BACKEND_IMAGE=* ]] \
    || [[ "${release_lines[1]}" != FRONTEND_IMAGE=* ]]; then
    echo "❌ Le fichier de release doit contenir exactement BACKEND_IMAGE puis FRONTEND_IMAGE."
    exit 1
  fi
  requested_backend="${release_lines[0]#BACKEND_IMAGE=}"
  requested_frontend="${release_lines[1]#FRONTEND_IMAGE=}"
  candidate_env="$(mktemp "$ROOT/.env.release.XXXXXX")"
  write_release_env .env "$candidate_env" "$requested_backend" "$requested_frontend"
  active_env="$candidate_env"
fi

# ── Sécurité : refuse un .env avec des secrets par défaut ────────────────────
# Empêche la copie accidentelle de .env.production.example (change_me_*) ou de
# valeurs de dev (Dev_Test_Only_1192) de partir en production. Le seed-staff
# est idempotent : un ROOT créé avec un mot de passe par défaut ne sera JAMAIS
# re-corrigé ensuite, donc on échoue dès le départ.
if grep -qE '(change_me_|CHANGE_ME_|Dev_Test_Only_1192)' .env; then
  echo "❌ .env contient au moins un secret par défaut/placeholder."
  exit 1
fi

target_backend="$(read_env_value BACKEND_IMAGE "$active_env")"
target_frontend="$(read_env_value FRONTEND_IMAGE "$active_env")"
if ! is_immutable_image "$target_backend" || ! is_immutable_image "$target_frontend"; then
  echo "❌ Les images applicatives doivent finir par un SHA Git complet (40 hex) ou un digest sha256."
  exit 1
fi

compose() {
  docker compose --env-file "$active_env" "$@"
}

compose config -q

previous_backend="$(docker inspect sovrack-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
previous_frontend="$(docker inspect sovrack-frontend --format '{{.Config.Image}}' 2>/dev/null || true)"

# Une migration sans sauvegarde vérifiée n'est pas une release acceptable.
if [ "$(docker inspect sovrack-postgres --format '{{.State.Running}}' 2>/dev/null || true)" = "true" ]; then
  ./scripts/backup.sh
else
  echo "ℹ️  Première installation détectée : aucune base existante à sauvegarder."
fi

# Une release applicative ne met pas implicitement à niveau Postgres, Redis ou
# Nginx. Ces composants ont leur propre cycle de maintenance planifié.
compose pull backend frontend migrator worker

if ! compose up -d --remove-orphans --wait --wait-timeout 240; then
  echo "❌ Release non saine. Journaux des services critiques :"
  compose logs --tail=150 migrator backend worker frontend || true

  allow_rollback="$(read_env_value ALLOW_AUTOMATIC_IMAGE_ROLLBACK .env)"
  if [ "$allow_rollback" = "true" ] \
    && is_immutable_image "$previous_backend" \
    && is_immutable_image "$previous_frontend"; then
    echo "↩️  Rollback d'images autorisé explicitement ; restauration de la release précédente."
    rollback_env="$(mktemp "$ROOT/.env.rollback.XXXXXX")"
    write_release_env .env "$rollback_env" "$previous_backend" "$previous_frontend"
    active_env="$rollback_env"
    compose pull backend frontend migrator worker
    compose up -d --remove-orphans --wait --wait-timeout 240
    mv -f -- "$rollback_env" .env
    rollback_env=""
    chmod 600 .env
  else
    echo "⛔ Rollback automatique non exécuté : la rétrocompatibilité des migrations n'est pas déclarée."
    echo "   La référence persistée dans .env reste inchangée ; inspecte la base et les logs avant toute action."
  fi
  exit 1
fi

# La promotion ne devient l'état désiré persistant qu'après tous les contrôles
# de santé. Un redémarrage ultérieur reprendra donc les mêmes images immuables.
if [ -n "$candidate_env" ]; then
  mv -f -- "$candidate_env" .env
  candidate_env=""
  chmod 600 .env
  active_env=".env"
fi

compose ps

if ! compose exec -T nginx sh -c 'test -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" && test -s "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"'; then
  echo "⚠️  Certificat TLS absent : Nginx fonctionne uniquement en mode challenge ACME."
  echo "   Lance ./scripts/certbot.sh puis vérifie HTTPS."
fi

echo "✅ Stack démarrée. Vérifie : docker compose ps ; docker compose logs -f backend"
