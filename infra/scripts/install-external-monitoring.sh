#!/usr/bin/env bash
# Install external Sovrack probes on the dedicated monitoring/CI VM.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host_uid="$(id -u)"
host_gid="$(id -g)"
if [ "$host_uid" -eq 0 ]; then
  default_monitoring_dir=/opt/monitoring
  runtime_uid=65534
  runtime_gid=65534
else
  account_home="$(getent passwd "$host_uid" | cut -d: -f6)"
  [ -n "$account_home" ] || {
    echo "ERROR: impossible de déterminer le dossier du compte courant."
    exit 1
  }
  default_monitoring_dir="$account_home/.local/share/sovrack-monitoring"
  runtime_uid="$host_uid"
  runtime_gid="$host_gid"
fi
MONITORING_DIR="${MONITORING_DIR:-$default_monitoring_dir}"
NETWORK="${MONITORING_NETWORK:-platform_monitoring}"
PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus@sha256:f6639335d34a77d9d9db382b92eeb7fc00934be8eae81dbc03b31cfe90411a94}"
ALERTMANAGER_IMAGE="${ALERTMANAGER_IMAGE:-prom/alertmanager@sha256:e13b6ed5cb929eeaee733479dce55e10eb3bc2e9c4586c705a4e8da41e5eacf5}"
BLACKBOX_IMAGE="${BLACKBOX_IMAGE:-quay.io/prometheus/blackbox-exporter@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc}"
NODE_EXPORTER_IMAGE="${NODE_EXPORTER_IMAGE:-prom/node-exporter@sha256:1b4e4438faca4dd7e001dd445d161a4a2091b0fededa84093b3a8dfeae1f1be0}"
CADVISOR_IMAGE="${CADVISOR_IMAGE:-ghcr.io/google/cadvisor@sha256:763aecf1c32c2be8a1a75f9abfc2fc461005c9dbbaa39cb356b354aac1296dbe}"
PROMETHEUS_RETENTION_TIME="${PROMETHEUS_RETENTION_TIME:-14d}"
PROMETHEUS_RETENTION_SIZE="${PROMETHEUS_RETENTION_SIZE:-2GB}"
BACKUP_DIR="$MONITORING_DIR/config-backups/$(date -u +%Y%m%d-%H%M%SZ)"
SECRETS_DIR="$MONITORING_DIR/secrets"
GITLAB_ALERT_URL_FILE="$SECRETS_DIR/gitlab-alert-url"
GITLAB_ALERT_TOKEN_FILE="$SECRETS_DIR/gitlab-alert-token"
ALERTMANAGER_CONFIG_SOURCE="$ROOT/monitoring/alertmanager.yml"
alertmanager_secret_mounts=()

if [ -f "$GITLAB_ALERT_URL_FILE" ] || [ -f "$GITLAB_ALERT_TOKEN_FILE" ]; then
  [ -f "$GITLAB_ALERT_URL_FILE" ] && [ -f "$GITLAB_ALERT_TOKEN_FILE" ] || {
    echo "ERROR: les deux fichiers GitLab Alertmanager sont obligatoires."
    exit 1
  }
  chmod 0600 "$GITLAB_ALERT_URL_FILE" "$GITLAB_ALERT_TOKEN_FILE"
  chown "$runtime_uid:$runtime_gid" \
    "$GITLAB_ALERT_URL_FILE" "$GITLAB_ALERT_TOKEN_FILE"
  ALERTMANAGER_CONFIG_SOURCE="$ROOT/monitoring/alertmanager.gitlab.yml"
  alertmanager_secret_mounts=(
    -v "$GITLAB_ALERT_URL_FILE:/etc/alertmanager/secrets/gitlab-alert-url:ro"
    -v "$GITLAB_ALERT_TOKEN_FILE:/etc/alertmanager/secrets/gitlab-alert-token:ro"
  )
fi

for image in \
  "$PROMETHEUS_IMAGE" \
  "$ALERTMANAGER_IMAGE" \
  "$BLACKBOX_IMAGE" \
  "$NODE_EXPORTER_IMAGE" \
  "$CADVISOR_IMAGE"; do
  [[ "$image" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo "ERROR: toutes les images de monitoring doivent être immuables."
    exit 1
  }
done

install -d -m 0700 "$BACKUP_DIR"
for current_config in \
  "$MONITORING_DIR/prometheus/prometheus.yml" \
  "$MONITORING_DIR/prometheus/alerts.yml" \
  "$MONITORING_DIR/alertmanager/alertmanager.yml" \
  "$MONITORING_DIR/blackbox/blackbox.yml"; do
  if [ -f "$current_config" ]; then
    cp -a "$current_config" "$BACKUP_DIR/"
  fi
done

install -d -m 0755 \
  "$MONITORING_DIR/prometheus" \
  "$MONITORING_DIR/prometheus/data" \
  "$MONITORING_DIR/alertmanager" \
  "$MONITORING_DIR/alertmanager/data" \
  "$MONITORING_DIR/blackbox"
install -m 0644 "$ROOT/monitoring/prometheus.yml" \
  "$MONITORING_DIR/prometheus/prometheus.yml"
install -m 0644 "$ROOT/monitoring/alerts.yml" \
  "$MONITORING_DIR/prometheus/alerts.yml"
install -m 0644 "$ALERTMANAGER_CONFIG_SOURCE" \
  "$MONITORING_DIR/alertmanager/alertmanager.yml"
install -m 0644 "$ROOT/monitoring/blackbox.yml" \
  "$MONITORING_DIR/blackbox/blackbox.yml"

docker pull "$PROMETHEUS_IMAGE" >/dev/null
docker pull "$ALERTMANAGER_IMAGE" >/dev/null
docker pull "$BLACKBOX_IMAGE" >/dev/null
docker pull "$NODE_EXPORTER_IMAGE" >/dev/null
docker pull "$CADVISOR_IMAGE" >/dev/null

docker run --rm \
  -v "$MONITORING_DIR/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$MONITORING_DIR/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  --entrypoint /bin/promtool "$PROMETHEUS_IMAGE" \
  check config /etc/prometheus/prometheus.yml
docker run --rm \
  -v "$MONITORING_DIR/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  "${alertmanager_secret_mounts[@]}" \
  --entrypoint /bin/amtool "$ALERTMANAGER_IMAGE" \
  check-config /etc/alertmanager/alertmanager.yml
docker run --rm \
  -v "$MONITORING_DIR/blackbox/blackbox.yml:/etc/blackbox_exporter/config.yml:ro" \
  "$BLACKBOX_IMAGE" --config.file=/etc/blackbox_exporter/config.yml --config.check

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create "$NETWORK" >/dev/null
fi

if docker container inspect alertmanager >/dev/null 2>&1; then
  docker cp alertmanager:/alertmanager/. "$MONITORING_DIR/alertmanager/data/" \
    >/dev/null 2>&1 || true
fi
chown -R "$runtime_uid:$runtime_gid" "$MONITORING_DIR/prometheus/data" \
  "$MONITORING_DIR/alertmanager/data"

for container in blackbox_exporter node_exporter cadvisor prometheus alertmanager; do
  if docker container inspect "$container" >/dev/null 2>&1; then
    docker rm -f "$container" >/dev/null
  fi
done

docker run -d --name node_exporter \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -v /:/host:ro,rslave \
  "$NODE_EXPORTER_IMAGE" \
  --path.rootfs=/host \
  --collector.filesystem.mount-points-exclude='^/(dev|proc|sys|var/lib/docker/.+|var/lib/containers/storage/.+)($|/)' >/dev/null

docker run -d --name cadvisor \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 256 \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -v /:/rootfs:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /sys:/sys:ro \
  -v /var/lib/docker:/var/lib/docker:ro \
  "$CADVISOR_IMAGE" >/dev/null

docker run -d --name blackbox_exporter \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 128 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -v "$MONITORING_DIR/blackbox/blackbox.yml:/etc/blackbox_exporter/config.yml:ro" \
  "$BLACKBOX_IMAGE" \
  --config.file=/etc/blackbox_exporter/config.yml >/dev/null

docker run -d --name alertmanager \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 128 \
  --user "$runtime_uid:$runtime_gid" \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -p 127.0.0.1:9093:9093 \
  -v "$MONITORING_DIR/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$MONITORING_DIR/alertmanager/data:/alertmanager" \
  "${alertmanager_secret_mounts[@]}" \
  "$ALERTMANAGER_IMAGE" \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager >/dev/null

docker run -d --name prometheus \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 256 \
  --user "$runtime_uid:$runtime_gid" \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 127.0.0.1:9090:9090 \
  -v "$MONITORING_DIR/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$MONITORING_DIR/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  -v "$MONITORING_DIR/prometheus/data:/prometheus" \
  "$PROMETHEUS_IMAGE" \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time="$PROMETHEUS_RETENTION_TIME" \
  --storage.tsdb.retention.size="$PROMETHEUS_RETENTION_SIZE" >/dev/null

for _attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:9090/-/ready >/dev/null \
    && curl -fsS http://127.0.0.1:9093/-/ready >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:9090/-/ready >/dev/null
curl -fsS http://127.0.0.1:9093/-/ready >/dev/null

query='probe_success{job="sovrack_external_https"}'
for _attempt in $(seq 1 20); do
  successes="$(curl -fsSG --data-urlencode "query=$query" \
    http://127.0.0.1:9090/api/v1/query \
    | jq -r '[.data.result[].value[1] | tonumber] | add // 0')"
  if [ "$successes" -ge 4 ]; then
    break
  fi
  sleep 3
done
[ "$successes" -ge 4 ] || {
  echo "ERROR: les quatre sondes HTTPS Sovrack ne sont pas toutes opérationnelles."
  exit 1
}

echo "External monitoring active: four HTTPS probes, HTTP redirect, TLS expiry, latency and host alerts."
