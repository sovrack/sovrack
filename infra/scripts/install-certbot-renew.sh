#!/usr/bin/env bash
# =============================================================================
# Sovrack — Installation du renouvellement TLS automatique
# -----------------------------------------------------------------------------
# Installe un cron (1er du mois à 03:00) qui lance make certbot-renew sur le
# VPS. Le renouvellement certbot est idempotent (ne renouvelle que si cert
# proche de l'expiration, ~30 jours avant la fin des 90).
#
# Usage (run en root/sudo sur le VPS) :
#   sudo ./scripts/install-certbot-renew.sh /srv/sovrack
#
# L'utilisateur cron doit avoir accès à docker + aux volumes du stack.
# =============================================================================
set -euo pipefail

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

# Docker nécessite souvent root pour le socket : exécute le cron en root.
cat > "$CRON_FILE" <<EOF
# Renouvellement TLS Sovrack — installé par scripts/install-certbot-renew.sh
# Exécuté le 1er de chaque mois à 03:00 (certbot renouvelle si < 30 jours).
0 3 1 * * root cd "${DEPLOY_DIR}" && make certbot-renew >> "${LOG_FILE}" 2>&1
EOF

chmod 644 "$CRON_FILE"
echo "✅ Cron installé : $CRON_FILE"
echo "   → 'cd $DEPLOY_DIR && make certbot-renew' tous les 1er du mois à 03:00."
echo "   Logs : $LOG_FILE — teste avec : run-parts --test /etc/cron.d ; sudo crontab -l | grep certbot"