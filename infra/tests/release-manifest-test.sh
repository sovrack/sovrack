#!/usr/bin/env bash
# shellcheck source-path=SCRIPTDIR
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../scripts/release-lib.sh
source "$ROOT/scripts/release-lib.sh"

temp_dir="$(mktemp -d)"
cleanup() {
  find "$temp_dir" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$temp_dir" 2>/dev/null || true
}
trap cleanup EXIT

valid="$temp_dir/valid.manifest"
{
  printf 'RELEASE_ID=v2.0.0-rc.1\n'
  printf 'BACKEND_IMAGE=registry.example/backend:%040d\n' 0
  printf 'FRONTEND_IMAGE=registry.example/frontend:%040d\n' 1
  printf 'NGINX_IMAGE=nginx@sha256:%064d\n' 4
  printf 'POSTGRES_IMAGE=postgres@sha256:%064d\n' 5
  printf 'REDIS_IMAGE=redis@sha256:%064d\n' 6
  printf 'BACKEND_COMMIT=%040d\n' 0
  printf 'FRONTEND_COMMIT=%040d\n' 1
  printf 'INFRA_COMMIT=%040d\n' 2
  printf 'RUNTIME_TOPOLOGY=compact\n'
  printf 'SCHEMA_MIGRATION=20260818120000_phase2_security_invariants\n'
  printf 'OPENAPI_SHA256=%064d\n' 3
} > "$valid"
validate_release_manifest "$valid"
configure_runtime_topology
[ "$BACKEND_PROCESS_ROLE" = "all" ]
[ -z "${COMPOSE_PROFILES:-}" ]
sed 's/RUNTIME_TOPOLOGY=compact/RUNTIME_TOPOLOGY=split/' \
  "$valid" > "$temp_dir/split.manifest"
validate_release_manifest "$temp_dir/split.manifest"
configure_runtime_topology
[ "$BACKEND_PROCESS_ROLE" = "api" ]
[ "$COMPOSE_PROFILES" = "split-runtime" ]
sed 's/RUNTIME_TOPOLOGY=compact/RUNTIME_TOPOLOGY=legacy-single/' \
  "$valid" > "$temp_dir/legacy.manifest"
validate_release_manifest "$temp_dir/legacy.manifest"

cp "$valid" "$temp_dir/extra.manifest"
printf 'UNEXPECTED=value\n' >> "$temp_dir/extra.manifest"
if validate_release_manifest "$temp_dir/extra.manifest" >/dev/null 2>&1; then
  echo "Expected an extra manifest field to be rejected."
  exit 1
fi

sed 's/BACKEND_COMMIT=0000000000000000000000000000000000000000/BACKEND_COMMIT=4444444444444444444444444444444444444444/' \
  "$valid" > "$temp_dir/mismatch.manifest"
if validate_release_manifest "$temp_dir/mismatch.manifest" >/dev/null 2>&1; then
  echo "Expected a tag/commit mismatch to be rejected."
  exit 1
fi

sed 's/RUNTIME_TOPOLOGY=compact/RUNTIME_TOPOLOGY=unknown/' \
  "$valid" > "$temp_dir/topology.manifest"
if validate_release_manifest "$temp_dir/topology.manifest" >/dev/null 2>&1; then
  echo "Expected an unknown runtime topology to be rejected."
  exit 1
fi

echo "Release manifest parser tests passed."
