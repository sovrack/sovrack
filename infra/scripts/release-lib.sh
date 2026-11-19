#!/usr/bin/env bash
# Shared, non-executable helpers for release/backup/restore scripts.
# Manifest and dotenv files are parsed as data; they are never sourced.

read_env_value() {
  local key="$1"
  local file="$2"
  awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print }' "$file"
}

require_single_env_key() {
  local key="$1"
  local file="$2"
  local count
  count="$(grep -c "^${key}=" "$file" || true)"
  [ "$count" -eq 1 ] || {
    echo "ERROR: $file doit contenir exactement une ligne $key=." >&2
    return 1
  }
  [ -n "$(read_env_value "$key" "$file")" ] || {
    echo "ERROR: $key est vide dans $file." >&2
    return 1
  }
}

is_immutable_image() {
  local image="$1"
  [[ "$image" =~ @sha256:[0-9a-fA-F]{64}$ || "$image" =~ :[0-9a-fA-F]{40}$ ]]
}

validate_release_manifest() {
  local manifest="$1"
  local -a expected_keys=(
    RELEASE_ID
    BACKEND_IMAGE
    FRONTEND_IMAGE
    NGINX_IMAGE
    POSTGRES_IMAGE
    REDIS_IMAGE
    BACKEND_COMMIT
    FRONTEND_COMMIT
    INFRA_COMMIT
    RUNTIME_TOPOLOGY
    SCHEMA_MIGRATION
    OPENAPI_SHA256
  )
  local -a lines
  local index key value

  [ -f "$manifest" ] && [ ! -L "$manifest" ] || {
    echo "ERROR: manifeste absent ou lien symbolique refusé : $manifest" >&2
    return 1
  }
  mapfile -t lines < "$manifest"
  [ "${#lines[@]}" -eq "${#expected_keys[@]}" ] || {
    echo "ERROR: le manifeste doit contenir exactement ${#expected_keys[@]} lignes." >&2
    return 1
  }

  for index in "${!expected_keys[@]}"; do
    key="${expected_keys[$index]}"
    [[ "${lines[$index]}" == "${key}="* ]] || {
      echo "ERROR: ligne $((index + 1)) du manifeste : $key attendu." >&2
      return 1
    }
    value="${lines[$index]#*=}"
    [ -n "$value" ] || {
      echo "ERROR: $key est vide dans le manifeste." >&2
      return 1
    }
  done

  RELEASE_ID="$(read_env_value RELEASE_ID "$manifest")"
  BACKEND_IMAGE="$(read_env_value BACKEND_IMAGE "$manifest")"
  FRONTEND_IMAGE="$(read_env_value FRONTEND_IMAGE "$manifest")"
  NGINX_IMAGE="$(read_env_value NGINX_IMAGE "$manifest")"
  POSTGRES_IMAGE="$(read_env_value POSTGRES_IMAGE "$manifest")"
  REDIS_IMAGE="$(read_env_value REDIS_IMAGE "$manifest")"
  BACKEND_COMMIT="$(read_env_value BACKEND_COMMIT "$manifest")"
  FRONTEND_COMMIT="$(read_env_value FRONTEND_COMMIT "$manifest")"
  INFRA_COMMIT="$(read_env_value INFRA_COMMIT "$manifest")"
  RUNTIME_TOPOLOGY="$(read_env_value RUNTIME_TOPOLOGY "$manifest")"
  SCHEMA_MIGRATION="$(read_env_value SCHEMA_MIGRATION "$manifest")"
  OPENAPI_SHA256="$(read_env_value OPENAPI_SHA256 "$manifest")"

  [[ "$RELEASE_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || {
    echo "ERROR: RELEASE_ID invalide." >&2
    return 1
  }
  is_immutable_image "$BACKEND_IMAGE" || {
    echo "ERROR: BACKEND_IMAGE doit utiliser un SHA Git complet ou un digest sha256." >&2
    return 1
  }
  is_immutable_image "$FRONTEND_IMAGE" || {
    echo "ERROR: FRONTEND_IMAGE doit utiliser un SHA Git complet ou un digest sha256." >&2
    return 1
  }
  for infrastructure_image in NGINX_IMAGE POSTGRES_IMAGE REDIS_IMAGE; do
    is_immutable_image "${!infrastructure_image}" || {
      echo "ERROR: $infrastructure_image doit utiliser un digest sha256." >&2
      return 1
    }
    [[ "${!infrastructure_image}" == *@sha256:* ]] || {
      echo "ERROR: $infrastructure_image doit utiliser un digest sha256, pas un tag Git." >&2
      return 1
    }
  done
  [[ "$BACKEND_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || {
    echo "ERROR: BACKEND_COMMIT doit contenir 40 caractères hexadécimaux." >&2
    return 1
  }
  [[ "$FRONTEND_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || {
    echo "ERROR: FRONTEND_COMMIT doit contenir 40 caractères hexadécimaux." >&2
    return 1
  }
  [[ "$INFRA_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || {
    echo "ERROR: INFRA_COMMIT doit contenir 40 caractères hexadécimaux." >&2
    return 1
  }
  [ "$RUNTIME_TOPOLOGY" = "split" ] || [ "$RUNTIME_TOPOLOGY" = "compact" ] \
    || [ "$RUNTIME_TOPOLOGY" = "legacy-single" ] || {
    echo "ERROR: RUNTIME_TOPOLOGY doit valoir split, compact ou legacy-single." >&2
    return 1
  }
  [[ "$SCHEMA_MIGRATION" =~ ^[0-9]{14}_[a-z0-9_]+$ ]] || {
    echo "ERROR: SCHEMA_MIGRATION doit être le nom complet de la dernière migration Prisma." >&2
    return 1
  }
  [[ "$OPENAPI_SHA256" =~ ^[0-9a-fA-F]{64}$ ]] || {
    echo "ERROR: OPENAPI_SHA256 doit être un SHA-256 hexadécimal." >&2
    return 1
  }

  case "$BACKEND_IMAGE" in
    *:"$BACKEND_COMMIT") ;;
    *@sha256:*) ;;
    *)
      echo "ERROR: le tag BACKEND_IMAGE ne correspond pas à BACKEND_COMMIT." >&2
      return 1
      ;;
  esac
  case "$FRONTEND_IMAGE" in
    *:"$FRONTEND_COMMIT") ;;
    *@sha256:*) ;;
    *)
      echo "ERROR: le tag FRONTEND_IMAGE ne correspond pas à FRONTEND_COMMIT." >&2
      return 1
      ;;
  esac

  export RELEASE_ID BACKEND_IMAGE FRONTEND_IMAGE NGINX_IMAGE POSTGRES_IMAGE REDIS_IMAGE
  export SERVER_IMAGE="${SERVER_IMAGE:-$BACKEND_IMAGE}"
  export WEB_IMAGE="${WEB_IMAGE:-$FRONTEND_IMAGE}"
  export BACKEND_COMMIT
  export FRONTEND_COMMIT INFRA_COMMIT RUNTIME_TOPOLOGY SCHEMA_MIGRATION OPENAPI_SHA256
  export SERVER_COMMIT="${SERVER_COMMIT:-$BACKEND_COMMIT}"
  export WEB_COMMIT="${WEB_COMMIT:-$FRONTEND_COMMIT}"
}

configure_runtime_topology() {
  case "$RUNTIME_TOPOLOGY" in
    split)
      export COMPOSE_PROFILES=split-runtime
      export BACKEND_PROCESS_ROLE=api
      export SERVER_PROCESS_ROLE=api
      ;;
    compact|legacy-single)
      unset COMPOSE_PROFILES || true
      export BACKEND_PROCESS_ROLE=all
      export SERVER_PROCESS_ROLE=all
      ;;
    *)
      echo "ERROR: topologie runtime invalide : $RUNTIME_TOPOLOGY" >&2
      return 1
      ;;
  esac
}

resolve_secrets_env() {
  local root="$1"
  local base="$2"
  if [ -n "${ENV_FILE:-}" ]; then
    printf '%s\n' "$ENV_FILE"
  elif [ -f "$base/shared/.env" ]; then
    printf '%s\n' "$base/shared/.env"
  else
    printf '%s\n' "$root/.env"
  fi
}

last_applied_migration() {
  local compose_function="$1"
  local postgres_user postgres_db
  postgres_user="$($compose_function exec -T postgres printenv POSTGRES_USER)"
  postgres_db="$($compose_function exec -T postgres printenv POSTGRES_DB)"
  "$compose_function" exec -T postgres psql -At -v ON_ERROR_STOP=1 \
    -U "$postgres_user" -d "$postgres_db" \
    -c 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1;'
}

assert_schema_migration() {
  local compose_function="$1"
  local expected="$2"
  local current failed_count postgres_user postgres_db
  postgres_user="$($compose_function exec -T postgres printenv POSTGRES_USER)"
  postgres_db="$($compose_function exec -T postgres printenv POSTGRES_DB)"
  failed_count="$("$compose_function" exec -T postgres psql -At -v ON_ERROR_STOP=1 \
    -U "$postgres_user" -d "$postgres_db" \
    -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;')"
  [ "$failed_count" = "0" ] || {
    echo "ERROR: $failed_count migration(s) Prisma en échec sont enregistrées." >&2
    return 1
  }
  current="$(last_applied_migration "$compose_function")"
  [ "$current" = "$expected" ] || {
    echo "ERROR: schéma $current, mais la release exige $expected." >&2
    return 1
  }
}

activate_release_directory() {
  local base="$1"
  local release_root="$2"
  local release_id="$3"
  local expected_root="$base/releases/$release_id"
  local next_link="$base/.current.next"

  [ "$(realpath -m "$release_root")" = "$(realpath -m "$expected_root")" ] || {
    echo "ERROR: la release doit être installée dans $expected_root." >&2
    return 1
  }
  ln -s "$expected_root" "$next_link"
  mv -Tf "$next_link" "$base/current"
}
