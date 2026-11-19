#!/usr/bin/env bash
# Install the VM-side encrypted pull timer after its SSH material is prepared.
set -euo pipefail

[ "${EUID:-$(id -u)}" -eq 0 ] || {
  echo "ERROR: exécuter avec sudo/root."
  exit 1
}

SOURCE_SCRIPT="$(realpath "${1:-$(dirname "${BASH_SOURCE[0]}")/pull-offsite-backup.sh}")"
[ -x "$SOURCE_SCRIPT" ] || {
  echo "ERROR: pull-offsite-backup.sh absent ou non exécutable."
  exit 1
}
install -m 0750 "$SOURCE_SCRIPT" /usr/local/sbin/sovrack-offsite-backup

cat > /etc/systemd/system/sovrack-offsite-backup.service <<'EOF'
[Unit]
Description=Sovrack encrypted off-VPS backup pull and restore verification
Wants=network-online.target docker.service
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sovrack-offsite-backup
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/opt/sovrack-offsite /srv/sovrack-offsite /run
EOF

cat > /etc/systemd/system/sovrack-offsite-backup.timer <<'EOF'
[Unit]
Description=Daily Sovrack encrypted off-VPS backup

[Timer]
OnCalendar=*-*-* 04:15:00 UTC
RandomizedDelaySec=15m
Persistent=true
Unit=sovrack-offsite-backup.service

[Install]
WantedBy=timers.target
EOF

chmod 0644 /etc/systemd/system/sovrack-offsite-backup.service \
  /etc/systemd/system/sovrack-offsite-backup.timer
systemctl daemon-reload
systemctl enable --now sovrack-offsite-backup.timer
systemctl list-timers sovrack-offsite-backup.timer --no-pager
