#!/usr/bin/env bash
# Install a daily systemd timer for the active, versioned release.
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
SERVICE_USER="$(stat -c %U "$BASE_DIR/shared")"
SERVICE_GROUP="$(stat -c %G "$BASE_DIR/shared")"
id "$SERVICE_USER" >/dev/null 2>&1 || {
  echo "ERROR: propriétaire de shared/ introuvable : $SERVICE_USER."
  exit 1
}

cat > /etc/systemd/system/sovrack-backup.service <<EOF
[Unit]
Description=Sovrack verified PostgreSQL backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_GROUP
Environment=SOVRACK_BASE_DIR=$BASE_DIR
ExecStart=$BASE_DIR/current/scripts/backup-current.sh
UMask=0077
EOF

cat > /etc/systemd/system/sovrack-backup.timer <<'EOF'
[Unit]
Description=Daily Sovrack PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=15m
Persistent=true
Unit=sovrack-backup.service

[Install]
WantedBy=timers.target
EOF

chmod 644 /etc/systemd/system/sovrack-backup.service \
  /etc/systemd/system/sovrack-backup.timer
systemctl daemon-reload
systemctl enable --now sovrack-backup.timer
systemctl list-timers sovrack-backup.timer --no-pager
