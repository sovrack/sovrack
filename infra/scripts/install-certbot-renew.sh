#!/usr/bin/env bash
# Install a systemd timer that renews the certificate in Docker's live volume.
set -euo pipefail

[ "${EUID:-$(id -u)}" -eq 0 ] || {
  echo "ERROR: exécuter avec sudo/root."
  exit 1
}
BASE_DIR="$(realpath "${1:-/srv/sovrack}")"
[ -d "$BASE_DIR/shared" ] && [ -L "$BASE_DIR/current" ] || {
  echo "ERROR: layout versionné absent dans $BASE_DIR."
  exit 1
}

cat > /etc/systemd/system/sovrack-certbot-renew.service <<EOF
[Unit]
Description=Renew Sovrack TLS certificate in Docker volume
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
WorkingDirectory=$BASE_DIR/current
Environment=SOVRACK_BASE_DIR=$BASE_DIR
Environment=ENV_FILE=$BASE_DIR/shared/.env
ExecStart=$BASE_DIR/current/scripts/certbot.sh --renew
UMask=0077
EOF

cat > /etc/systemd/system/sovrack-certbot-renew.timer <<'EOF'
[Unit]
Description=Twice-daily Sovrack TLS renewal check

[Timer]
OnCalendar=*-*-* 03,15:17:00
RandomizedDelaySec=15m
Persistent=true
Unit=sovrack-certbot-renew.service

[Install]
WantedBy=timers.target
EOF

chmod 644 /etc/systemd/system/sovrack-certbot-renew.service \
  /etc/systemd/system/sovrack-certbot-renew.timer
systemctl daemon-reload
systemctl enable --now sovrack-certbot-renew.timer
systemctl list-timers sovrack-certbot-renew.timer --no-pager
