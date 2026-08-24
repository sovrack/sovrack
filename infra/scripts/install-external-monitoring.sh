#!/usr/bin/env bash
# Install external Sovrack probes on the dedicated monitoring/CI VM.
set -euo pipefail
umask 077

[ "${EUID:-$(id -u)}" -eq 0 ] || {
  echo "ERROR: exécuter avec sudo/root."
  exit 1
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONITORING_DIR="${MONITORING_DIR:-/opt/monitoring}"
NETWORK="${MONITORING_NETWORK:-platform_monitoring}"
PROMETHEUS_IMAGE="${PROMETHEUS_IMAGE:-prom/prometheus@sha256:f6639335d34a77d9d9db382b92eeb7fc00934be8eae81dbc03b31cfe90411a94}"
ALERTMANAGER_IMAGE="${ALERTMANAGER_IMAGE:-prom/alertmanager@sha256:e13b6ed5cb929eeaee733479dce55e10eb3bc2e9c4586c705a4e8da41e5eacf5}"
BLACKBOX_IMAGE="${BLACKBOX_IMAGE:-quay.io/prometheus/blackbox-exporter@sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc}"
BACKUP_DIR="$MONITORING_DIR/config-backups/$(date -u +%Y%m%d-%H%M%SZ)"

for image in "$PROMETHEUS_IMAGE" "$ALERTMANAGER_IMAGE" "$BLACKBOX_IMAGE"; do
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
install -m 0644 "$ROOT/monitoring/alertmanager.yml" \
  "$MONITORING_DIR/alertmanager/alertmanager.yml"
install -m 0644 "$ROOT/monitoring/blackbox.yml" \
  "$MONITORING_DIR/blackbox/blackbox.yml"

docker pull "$PROMETHEUS_IMAGE" >/dev/null
docker pull "$ALERTMANAGER_IMAGE" >/dev/null
docker pull "$BLACKBOX_IMAGE" >/dev/null

docker run --rm \
  -v "$MONITORING_DIR/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$MONITORING_DIR/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  --entrypoint /bin/promtool "$PROMETHEUS_IMAGE" \
  check config /etc/prometheus/prometheus.yml
docker run --rm \
  -v "$MONITORING_DIR/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
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
chown -R 65534:65534 "$MONITORING_DIR/prometheus/data" \
  "$MONITORING_DIR/alertmanager/data"

for container in blackbox_exporter prometheus alertmanager; do
  if docker container inspect "$container" >/dev/null 2>&1; then
    docker rm -f "$container" >/dev/null
  fi
done

docker run -d --name blackbox_exporter \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
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
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  -p 127.0.0.1:9093:9093 \
  -v "$MONITORING_DIR/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  -v "$MONITORING_DIR/alertmanager/data:/alertmanager" \
  "$ALERTMANAGER_IMAGE" \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager >/dev/null

docker run -d --name prometheus \
  --restart unless-stopped \
  --network "$NETWORK" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -p 127.0.0.1:9090:9090 \
  -v "$MONITORING_DIR/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  -v "$MONITORING_DIR/prometheus/alerts.yml:/etc/prometheus/alerts.yml:ro" \
  -v "$MONITORING_DIR/prometheus/data:/prometheus" \
  "$PROMETHEUS_IMAGE" \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=30d \
  --storage.tsdb.retention.size=8GB >/dev/null

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
