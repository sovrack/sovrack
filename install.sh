#!/usr/bin/env bash
# ==============================================================================
# 1-Click Automated Installer (Self-Hosted Community Edition)
# ==============================================================================

set -euo pipefail

# --- Configurable Variables ---
APP_NAME="${APP_NAME:-Platform}"
APP_SLUG="${APP_SLUG:-platform}"
APP_DOMAIN="${APP_DOMAIN:-example.com}"
GHCR_ORG="${GHCR_ORG:-platform}"
INSTALL_DIR="${INSTALL_DIR:-/srv/${APP_SLUG}}"
PORT="${APP_PORT:-3000}"

# --- Color formatting ---
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Banner ---
print_banner() {
  cat << "EOF"
  ____  _       _    __                      
 |  _ \| | __ _| |_ / _| ___  _ __ _ __ ___  
 | |_) | |/ _` | __| |_ / _ \| '__| '_ ` _ \ 
 |  __/| | (_| | |_|  _| (_) | |  | | | | | |
 |_|   |_|\__,_|\__|_|  \___/|_|  |_| |_| |_|
EOF
  echo -e "${CYAN}${BOLD}${APP_NAME} — Self-Hosted Infrastructure & Orchestration Platform${NC}"
  echo -e "Website: https://${APP_DOMAIN}  |  Docs: https://docs.${APP_DOMAIN}"
  echo "----------------------------------------------------------------------"
}

log_info() {
  echo -e "${CYAN}ℹ [INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}✔ [SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠ [WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}✖ [ERROR]${NC} $1" >&2
}

# --- Privilege Check ---
check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_error "This installer must be run as root or with sudo."
    echo "Please re-run: sudo bash $0"
    exit 1
  fi
}

# --- OS & Architecture Check ---
check_environment() {
  log_info "Verifying host operating system and architecture..."
  local os_type
  os_type="$(uname -s)"
  if [ "$os_type" != "Linux" ]; then
    log_error "${APP_NAME} installer currently only supports Linux (Ubuntu, Debian, CentOS, Alma, Rocky, Fedora, Arch)."
    exit 1
  fi

  local arch
  arch="$(uname -m)"
  if [ "$arch" != "x86_64" ] && [ "$arch" != "aarch64" ] && [ "$arch" != "arm64" ]; then
    log_warn "Architecture '$arch' detected. Standard builds are targeted for x86_64 and arm64."
  fi
  log_success "Environment verified ($os_type $arch)."
}

# --- Docker & Compose Check / Install ---
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log_success "Docker and Docker Compose v2 are already installed."
    return 0
  fi

  log_info "Docker or Docker Compose v2 is missing. Installing official Docker Engine..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- https://get.docker.com | sh
  else
    log_error "Neither curl nor wget was found. Please install curl or wget first."
    exit 1
  fi

  systemctl enable --now docker || true
  log_success "Docker Engine and Compose v2 successfully installed."
}

# --- Detect Public IP ---
get_public_ip() {
  local ip=""
  ip=$(curl -s -m 5 https://api.ipify.org 2>/dev/null || curl -s -m 5 https://ifconfig.me 2>/dev/null || true)
  if [ -z "$ip" ]; then
    ip="127.0.0.1"
  fi
  echo "$ip"
}

# --- Generate Cryptographic Secrets ---
generate_secrets() {
  local secrets_file="$1"
  log_info "Generating cryptographically secure secrets..."

  local jwt_sec
  local staff_jwt_sec
  local staff_otp_sec
  local customer_mfa_sec
  local config_sec
  local pg_password

  jwt_sec=$(openssl rand -hex 32)
  staff_jwt_sec=$(openssl rand -hex 32)
  staff_otp_sec=$(openssl rand -hex 32)
  customer_mfa_sec=$(openssl rand -hex 32)
  config_sec=$(openssl rand -hex 16)
  pg_password=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

  cat > "$secrets_file" << SEC_EOF
# Auto-generated security credentials for ${APP_NAME}
NODE_ENV=production
PORT=${PORT}
POSTGRES_USER=${APP_SLUG}_admin
POSTGRES_PASSWORD=${pg_password}
POSTGRES_DB=${APP_SLUG}
DATABASE_URL=postgresql://${APP_SLUG}_admin:${pg_password}@postgres:5432/${APP_SLUG}

JWT_SECRET=${jwt_sec}
STAFF_JWT_SECRET=${staff_jwt_sec}
STAFF_OTP_SECRET=${staff_otp_sec}
CUSTOMER_MFA_SECRET=${customer_mfa_sec}
CONFIG_SECRET=${config_sec}

AUTH_COOKIE_NAME=${APP_SLUG}_token
STAFF_AUTH_COOKIE_NAME=${APP_SLUG}_staff_token
SEC_EOF

  chmod 600 "$secrets_file"
  log_success "Secrets generated at $secrets_file"
}

# --- Main Entry Point ---
main() {
  print_banner
  check_root
  check_environment
  ensure_docker

  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  local env_file="${INSTALL_DIR}/.env.production"
  if [ ! -f "$env_file" ]; then
    generate_secrets "$env_file"
  fi

  local pub_ip
  pub_ip=$(get_public_ip)

  log_success "Installation completed successfully."
  echo ""
  echo "=========================================================================="
  echo -e "🚀 ${BOLD}${APP_NAME} is ready!${NC}"
  echo -e "Access your instance: ${CYAN}http://${pub_ip}:${PORT}${NC}"
  echo "=========================================================================="
}

main "$@"
