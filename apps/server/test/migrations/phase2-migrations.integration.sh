#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CONTAINER_NAME="sovrack-phase2-migrations-test"
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Refus : le conteneur Docker de test existe déjà."
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
case "$TEMP_DIR" in
  /tmp/tmp.*) ;;
  *) echo "Répertoire temporaire inattendu : $TEMP_DIR"; exit 1 ;;
esac

cleanup() {
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  find "$TEMP_DIR" -mindepth 1 -delete 2>/dev/null || true
  rmdir "$TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

database_host="127.0.0.1"
publish_address="127.0.0.1::5432"
case "${DOCKER_HOST:-}" in
  tcp://*)
    # En Docker-in-Docker, le daemon vit dans le service GitLab `docker` :
    # publier seulement sur sa loopback rend le port inaccessible au job.
    docker_authority="${DOCKER_HOST#tcp://}"
    database_host="${docker_authority%%:*}"
    publish_address="0.0.0.0::5432"
    ;;
esac

docker run -d --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=phase2_fresh \
  -p "$publish_address" \
  postgres:16-alpine >/dev/null

for _attempt in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d phase2_fresh >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER_NAME" pg_isready -U postgres -d phase2_fresh >/dev/null

port_binding="$(docker port "$CONTAINER_NAME" 5432/tcp)"
postgres_port="${port_binding##*:}"
base_url="postgresql://postgres:postgres@${database_host}:${postgres_port}"
export CONFIG_SECRET="integration-config-secret-at-least-32-characters"

# pg_isready above proves that PostgreSQL is accepting connections inside the
# container. With Docker-in-Docker, however, the published port/NAT rule can
# become reachable from the job a few seconds later (especially after a cold
# image pull). Prove that second boundary before Prisma uses the host port.
published_port_ready=false
for _attempt in $(seq 1 30); do
  if node -e '
    const net = require("node:net");
    const socket = net.createConnection({ host: process.argv[1], port: Number(process.argv[2]) });
    const fail = () => { socket.destroy(); process.exit(1); };
    socket.setTimeout(1000);
    socket.once("connect", () => { socket.end(); process.exit(0); });
    socket.once("timeout", fail);
    socket.once("error", fail);
  ' "$database_host" "$postgres_port"; then
    published_port_ready=true
    break
  fi
  sleep 1
done
[ "$published_port_ready" = "true" ] || {
  echo "Le port PostgreSQL publié n'est pas joignable depuis le job CI."
  exit 1
}

# Chemin base vide : les deux pré-gardes doivent accepter l'absence de tables,
# puis toutes les migrations doivent s'appliquer.
export DATABASE_URL="${base_url}/phase2_fresh"
node dist/scripts/backfill-database-credentials.js
node dist/scripts/pre-migrate-check.js
npx prisma migrate deploy
docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_fresh \
  -c "SELECT count(*) FROM information_schema.columns WHERE table_name='TeamMember' AND column_name IN ('role','status');" \
  | grep -qx '2'

# Chemin upgrade : applique uniquement l'historique antérieur à Phase 2, insère
# un tenant représentatif et une credential DB legacy, puis exécute le même
# ordre que le conteneur migrator de production.
mkdir -p "$TEMP_DIR/migrations"
cp -R prisma/migrations/. "$TEMP_DIR/migrations/"
for migration in \
  20260817183000_phase2_workspace_authorization \
  20260817190000_phase2_server_runs_workspace \
  20260818120000_phase2_security_invariants; do
  [ -d "$TEMP_DIR/migrations/$migration" ]
  find "$TEMP_DIR/migrations/$migration" -depth -delete
done

docker exec "$CONTAINER_NAME" createdb -U postgres phase2_upgrade
export DATABASE_URL="${base_url}/phase2_upgrade"
PRISMA_INTEGRATION_MIGRATIONS="$TEMP_DIR/migrations" \
  npx prisma migrate deploy --config test/migrations/prisma.integration.config.ts

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d phase2_upgrade <<'SQL'
INSERT INTO "User" (
  "id", "email", "password", "provider", "fullName", "role", "isActive",
  "emailVerifiedAt", "createdAt", "updatedAt"
) VALUES (
  'user-1', 'owner@example.test', 'test-hash', 'email', 'Owner', 'OWNER', TRUE,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Team" ("id", "name", "createdAt", "updatedAt")
VALUES ('team-1', 'Workspace Test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "TeamMember" ("id", "teamId", "userId", "joinedAt")
VALUES ('team-member-1', 'team-1', 'user-1', CURRENT_TIMESTAMP);
INSERT INTO "Project" ("id", "name", "teamId", "createdAt", "updatedAt")
VALUES ('project-1', 'Project Test', 'team-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "ProjectMember" (
  "id", "projectId", "userId", "role", "joinedAt", "updatedAt"
) VALUES (
  'project-member-1', 'project-1', 'user-1', 'OWNER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Service" (
  "id", "name", "type", "projectId", "databaseType", "databaseCredentials",
  "createdAt", "updatedAt"
) VALUES (
  'service-1', 'Database Test', 'DATABASE', 'project-1', 'POSTGRES',
  '{"user":"legacy","password":"legacy-password","dbName":"legacy_db"}'::jsonb,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
SQL

node dist/scripts/backfill-database-credentials.js
node dist/scripts/pre-migrate-check.js
npx prisma migrate deploy

docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_upgrade \
  -c "SELECT tm.role::text || ':' || tm.status::text || ':' || pm.role::text || ':' || pm.\"teamId\" FROM \"TeamMember\" tm JOIN \"ProjectMember\" pm ON pm.\"userId\"=tm.\"userId\";" \
  | grep -qx 'OWNER:ACTIVE:MAINTAINER:team-1'
docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_upgrade \
  -c "SELECT trim(both '\"' from \"databaseCredentials\"::text) LIKE 'v2:%' FROM \"Service\" WHERE id='service-1';" \
  | grep -qx 't'

# Atomicity path: deliberately violate the first Phase-2 precondition after
# applying the complete historical schema. PostgreSQL must roll back every DDL
# statement from that migration, not leave new enums/columns behind.
docker exec "$CONTAINER_NAME" createdb -U postgres phase2_atomicity
export DATABASE_URL="${base_url}/phase2_atomicity"
PRISMA_INTEGRATION_MIGRATIONS="$TEMP_DIR/migrations" \
  npx prisma migrate deploy --config test/migrations/prisma.integration.config.ts
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d phase2_atomicity <<'SQL'
INSERT INTO "Team" ("id", "name", "createdAt", "updatedAt")
VALUES ('ownerless-team', 'Ownerless workspace', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SQL

if npx prisma migrate deploy >"$TEMP_DIR/expected-migration-failure.log" 2>&1; then
  echo "Expected the ownerless-workspace migration to fail."
  exit 1
fi
docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_atomicity \
  -c "SELECT to_regtype('\"WorkspaceRole\"') IS NULL;" | grep -qx 't'
docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_atomicity \
  -c "SELECT count(*) FROM information_schema.columns WHERE table_name='Team' AND column_name='slug';" \
  | grep -qx '0'
docker exec "$CONTAINER_NAME" psql -At -U postgres -d phase2_atomicity \
  -c "SELECT to_regclass('\"Team_name_key\"') IS NOT NULL;" | grep -qx 't'

echo "Fresh, pre-Phase-2 upgrade and transactional-failure migration paths passed."
