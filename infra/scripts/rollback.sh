#!/usr/bin/env bash
# Release-aware rollback: supports zero-data-loss app-only rollback or full database restore.
set -euo pipefail
umask 077

# Acquisition du verrou flock exclusif
if [ "${SOVRACK_LOCK_ACQUIRED:-false}" != "true" ]; then
  LOCK_FILE="/var/run/lock/sovrack.lock"
  [ -d "/var/run/lock" ] && [ -w "/var/run/lock" ] || LOCK_FILE="/tmp/sovrack.lock"
  exec 200>"$LOCK_FILE"
  flock -n 200 || {
    echo "ERROR: Une autre opération Sovrack (déploiement/sauvegarde/restauration) est déjà en cours d'exécution." >&2
    exit 1
  }
  export SOVRACK_LOCK_ACQUIRED=true
fi

BASE_DIR="${SOVRACK_BASE_DIR:-/srv/sovrack}"
RELEASE_ID="${1:-}"
SECOND_ARG="${2:-}"

[ -n "$RELEASE_ID" ] && [ -n "$SECOND_ARG" ] && [ -z "${3:-}" ] || {
  echo "Usage: $0 <release-id> --app-only"
  echo "       $0 <release-id> <backup.sql.gz>"
  exit 1
}

[[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
  echo "ERROR: release id invalide."
  exit 1
}

TARGET="$BASE_DIR/releases/$RELEASE_ID"
MANIFEST="$BASE_DIR/shared/release-manifests/$RELEASE_ID.manifest"
SHARED_DIR="$BASE_DIR/shared"
MAINTENANCE_DIR="${SOVRACK_MAINTENANCE_DIR:-$SHARED_DIR/maintenance}"

[ -d "$TARGET" ] && [ ! -L "$TARGET" ] || {
  echo "ERROR: release installée introuvable : $TARGET"
  exit 1
}
[ -f "$MANIFEST" ] || {
  echo "ERROR: manifeste archivé introuvable : $MANIFEST"
  exit 1
}

# Mode 1 : Rollback applicatif sans toucher à la base de données (zéro perte de données)
if [ "$SECOND_ARG" = "--app-only" ]; then
  echo "🚀 Démarrage du rollback applicatif (App-Only) vers la release $RELEASE_ID..."
  # shellcheck source=release-lib.sh
  source "$TARGET/scripts/release-lib.sh"
  validate_release_manifest "$MANIFEST"
  
  runtime_services=(server)
  configure_runtime_topology
  if [ "$RUNTIME_TOPOLOGY" = "split" ]; then
    runtime_services+=(worker)
  fi

  SECRETS_ENV="$(resolve_secrets_env "$TARGET" "$BASE_DIR")"
  COMPOSE_FILE="$TARGET/docker-compose.prod.yml"

  compose() {
    docker compose --env-file "$SECRETS_ENV" --env-file "$MANIFEST" \
      -f "$COMPOSE_FILE" "$@"
  }

  echo "Vérification des images de la release cible..."
  if ! docker image inspect "$BACKEND_IMAGE" "$FRONTEND_IMAGE" >/dev/null 2>&1; then
    echo "Téléchargement des images de la release $RELEASE_ID..."
    compose pull server web
  fi

  echo "Activation du mode maintenance temporaire..."
  mkdir -p "$MAINTENANCE_DIR"
  touch "$MAINTENANCE_DIR/enabled"

  rollback_succeeded=false
  on_exit() {
    if [ "$rollback_succeeded" != "true" ]; then
      echo "ERROR: Le rollback applicatif a échoué. La maintenance reste active."
    fi
  }
  trap on_exit EXIT

  echo "Redémarrage des services applicatifs sur la version $RELEASE_ID..."
  compose up -d --no-deps --wait --wait-timeout 240 "${runtime_services[@]}" web nginx

  echo "Exécution des vérifications de santé..."
  compose exec -T server node -e \
    "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  compose exec -T web wget -qO- http://127.0.0.1:3000/ >/dev/null

  echo "Bascule atomique du lien symbolique /current vers $RELEASE_ID..."
  activate_release_directory "$BASE_DIR" "$TARGET" "$RELEASE_ID"

  rm -f "$MAINTENANCE_DIR/enabled"
  rollback_succeeded=true
  echo "✓ Rollback applicatif vers $RELEASE_ID terminé avec succès (zéro perte de données en base)."
  exit 0
fi

# Mode 2 : Rollback complet avec restauration du dump SQL
DUMP="$SECOND_ARG"
echo "Rollback complet vers la release: $RELEASE_ID avec restauration de la base depuis $DUMP."
echo "ATTENTION : Ce mode remplace l'intégralité de la base de données PostgreSQL."
SOVRACK_BASE_DIR="$BASE_DIR" \
  "$TARGET/scripts/restore.sh" "$DUMP" --release-file "$MANIFEST" --mode exact
