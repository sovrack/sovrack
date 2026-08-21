#!/usr/bin/env bash
# =============================================================================
# Sovrack — Installation du renouvellement TLS automatique
# -----------------------------------------------------------------------------
# Installe un cron deux fois par jour qui lance make certbot-renew sur le VPS.
# Certbot décide lui-même si le certificat est assez proche de l'expiration.
#
# Usage (run en root/sudo sur le VPS) :
#   sudo ./scripts/install-certbot-renew.sh /srv/sovrack
#
# L'utilisateur cron doit avoir accès à docker + aux volumes du stack.
# =============================================================================
set -euo pipefail

[ "${EUID:-$(id -u)}" -eq 0 ] || {
  echo "❌ Ce script doit être exécuté avec sudo/root."
  exit 1
}

DEPLOY_DIR="${1:-/srv/sovrack}"
CRON_FILE="/etc/cron.d/certbot-renew"
LOG_FILE="/var/log/certbot-renew.log"

if [ ! -d "$DEPLOY_DIR" ]; then
  echo "❌ $DEPLOY_DIR n'existe pas. Passe le chemin en argument : sudo ./scripts/install-certbot-renew.sh /srv/sovrack"
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ docker introuvable sur le PATH (requis pour certbot via conteneur)."
  exit 1
fi
if ! command -v make >/dev/null 2>&1 || ! command -v flock >/dev/null 2>&1; then
  echo "❌ make et flock sont requis pour installer le renouvellement."
  exit 1
fi

DEPLOY_DIR="$(realpath "$DEPLOY_DIR")"
[[ "$DEPLOY_DIR" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "❌ Chemin de déploiement non pris en charge dans cron : $DEPLOY_DIR"
  exit 1
}
MAKE_BIN="$(command -v make)"
FLOCK_BIN="$(command -v flock)"

# Docker nécessite souvent root pour le socket. flock empêche deux exécutions
# de se chevaucher si une autorité ACME répond lentement.
cat > "$CRON_FILE" <<EOF
# Renouvellement TLS Sovrack — installé par scripts/install-certbot-renew.sh
# Vérification deux fois par jour ; certbot ne renouvelle que si nécessaire.
17 3,15 * * * root cd "${DEPLOY_DIR}" && ${FLOCK_BIN} -n /run/sovrack-certbot-renew.lock ${MAKE_BIN} certbot-renew >> "${LOG_FILE}" 2>&1
EOF

chmod 644 "$CRON_FILE"
echo "✅ Cron installé : $CRON_FILE"
echo "   → 'cd $DEPLOY_DIR && make certbot-renew' à 03:17 et 15:17."
echo "   Logs : $LOG_FILE"
