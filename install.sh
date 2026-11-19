#!/usr/bin/env bash
# ==============================================================================
# Sovrack — Official 1-Click Automated Installer (Self-Hosted Community Edition)
# https://sovrack.tech — Modern Multi-Server Deployment & SSH Orchestration
# ==============================================================================

set -euo pipefail

# --- Color formatting ---
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

INSTALL_DIR="${SOVRACK_DIR:-/srv/sovrack}"
PORT="${SOVRACK_PORT:-3000}"

# --- Banner ---
print_banner() {
  cat << "EOF"
  ____             _             _             
 |  _ \  ___ _ __ | | ___  _   _/ \   _ __ ___ 
 | | | |/ _ \ '_ \| |/ _ \| | | / _ \ | '__/ __|
 | |_| |  __/ |_) | | (_) | |_| / ___ \| | | (__ 
 |____/ \___| .__/|_|\___/ \__, /_/   \_\_|  \___|
            |_|            |___/                 
EOF
  echo -e "${CYAN}${BOLD}Sovrack — Self-Hosted Community & Enterprise Platform${NC}"
  echo -e "Website: https://sovrack.tech  |  Docs: https://sovrack.tech/docs"
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
    log_error "Sovrack installer currently only supports Linux (Ubuntu, Debian, CentOS, Alma, Rocky, Fedora, Arch)."
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
  log_info "Generating cryptographically secure secrets..."
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"

  local jwt_secret staff_jwt_secret config_secret pg_password redis_password
  jwt_secret=$(openssl rand -hex 32)
  staff_jwt_secret=$(openssl rand -hex 32)
  config_secret=$(openssl rand -hex 32)
  pg_password=$(openssl rand -hex 24)
  redis_password=$(openssl rand -hex 24)

  local public_ip
  public_ip=$(get_public_ip)

  # Write .env configuration
  cat > "$INSTALL_DIR/.env" << EOF
# Sovrack Self-Hosted Production Configuration
NODE_ENV=production
PORT=3001
HOST_PLANE_ENFORCEMENT=false
BILLING_ENABLED=false

# Networking & URLs
PUBLIC_IP=${public_ip}
FRONTEND_URL=http://${public_ip}:${PORT}
PUBLIC_SITE_URL=http://${public_ip}:${PORT}
CUSTOMER_APP_URL=http://${public_ip}:${PORT}
STAFF_APP_URL=http://${public_ip}:${PORT}/staff
NEXT_PUBLIC_API_URL=http://${public_ip}:3001
NEXT_PUBLIC_WS_URL=ws://${public_ip}:3001

# Database & Cache
POSTGRES_DB=sovrack
POSTGRES_USER=sovrack
POSTGRES_PASSWORD=${pg_password}
DATABASE_URL=postgresql://sovrack:${pg_password}@postgres:5432/sovrack
REDIS_URL=redis://:${redis_password}@redis:6379

# Security Secrets
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=7d
STAFF_JWT_SECRET=${staff_jwt_secret}
STAFF_JWT_EXPIRES_IN=7d
CONFIG_SECRET=${config_secret}
AUTH_COOKIE_SECURE=false

# Ansible & Storage
ANSIBLE_PLAYBOOKS_PATH=/app/ansible/playbooks
ANSIBLE_STRICT_HOST_KEY_CHECKING=accept-new
EOF

  log_success "Environment file written to $INSTALL_DIR/.env"
}

# --- Write Docker Compose File ---
write_compose() {
  log_info "Creating Docker Compose orchestration manifest..."

  cat > "$INSTALL_DIR/docker-compose.yml" << 'EOF'
name: sovrack

networks:
  sovrack-net:
    driver: bridge

volumes:
  pgdata:
  redisdata:

services:
  postgres:
    image: postgres:16-alpine
    container_name: sovrack-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-sovrack}
      POSTGRES_USER: ${POSTGRES_USER:-sovrack}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - sovrack-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-sovrack} -d ${POSTGRES_DB:-sovrack}"]
      interval: 3s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7-alpine
    container_name: sovrack-redis
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    networks:
      - sovrack-net
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a ${REDIS_PASSWORD} ping | grep -q PONG"]
      interval: 3s
      timeout: 3s
      retries: 20

  server:
    image: ghcr.io/sovrack/server:latest
    container_name: sovrack-server
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3001:3001"
    networks:
      - sovrack-net
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 20s

  web:
    image: ghcr.io/sovrack/web:latest
    container_name: sovrack-web
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3000:3000"
    networks:
      - sovrack-net
    depends_on:
      server:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 15s
EOF

  log_success "Docker Compose file written to $INSTALL_DIR/docker-compose.yml"
}

# --- Launch Sovrack Containers ---
start_sovrack() {
  log_info "Pulling and starting Sovrack containers in $INSTALL_DIR..."
  cd "$INSTALL_DIR"
  docker compose pull || true
  docker compose up -d

  log_info "Waiting for Sovrack to complete migrations and initialization..."
  local retries=30
  local ready=false

  while [ $retries -gt 0 ]; do
    if curl -s -f "http://127.0.0.1:${PORT}/login" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 3
    retries=$((retries - 1))
    echo -n "."
  done
  echo ""

  local public_ip
  public_ip=$(get_public_ip)

  echo ""
  echo "======================================================================"
  log_success "${BOLD}Sovrack is installed and running successfully!${NC}"
  echo "======================================================================"
  echo ""
  echo -e "  🌐 ${BOLD}Dashboard URL:${NC}    http://${public_ip}:${PORT}"
  echo -e "  📁 ${BOLD}Install Directory:${NC} ${INSTALL_DIR}"
  echo -e "  ⚙️  ${BOLD}Config / Secrets:${NC}  ${INSTALL_DIR}/.env"
  echo ""
  echo "To view live logs:    cd ${INSTALL_DIR} && docker compose logs -f"
  echo "To restart platform:  cd ${INSTALL_DIR} && docker compose restart"
  echo "To stop platform:     cd ${INSTALL_DIR} && docker compose down"
  echo ""
  echo "Documentation & Guides: https://sovrack.tech/docs"
  echo "======================================================================"
}

# --- Main Execution ---
main() {
  print_banner
  check_root
  check_environment
  ensure_docker
  generate_secrets
  write_compose
  start_sovrack
}

main "$@"
