# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# ansible-core (~8 MB) instead of the full `ansible` meta-package (~100+ MB which
# bundles hundreds of collections). We install ONLY the 3 collections we actually
# use (ansible/requirements.yml) below → much smaller image, same capabilities.
RUN apk upgrade --no-cache && \
    apk add --no-cache python3 ansible-core openssh-client curl ca-certificates

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Install ONLY the collections we use into a world-readable system path so the
# non-root runtime user (appuser) finds them. /usr/share/ansible/collections is
# already on ansible-core's default COLLECTIONS_PATH; we also export it to be safe.
COPY ansible/requirements.yml ./ansible/requirements.yml
RUN set -eu; \
    attempt=1; \
    while [ "$attempt" -le 3 ]; do \
      if ansible-galaxy collection install -r ansible/requirements.yml \
          -p /usr/share/ansible/collections; then \
        break; \
      fi; \
      if [ "$attempt" -eq 3 ]; then \
        echo "Ansible Galaxy installation failed after $attempt attempts" >&2; \
        exit 1; \
      fi; \
      delay=$((attempt * 5)); \
      echo "Ansible Galaxy unavailable; retrying in ${delay}s" >&2; \
      sleep "$delay"; \
      attempt=$((attempt + 1)); \
    done
ENV ANSIBLE_COLLECTIONS_PATH=/usr/share/ansible/collections

# ── Install Nixpacks (used by NixpacksService for local builds + plan generation) ──
# Nixpacks is a single static binary (~50MB) — no runtime deps, no Nix daemon required.
# It auto-detects the language/framework and generates a Dockerfile.
# See: https://github.com/railwayapp/nixpacks
# NB: les assets GitHub de nixpacks sont nommés par triple Rust
# (nixpacks-v<ver>-<arch>-unknown-linux-musl.tar.gz) — il n'existe PAS de
# variante "nixpacks-linux-amd64.tar.gz" (l'ancien pattern 404ait toujours).
# musl = adapté à Alpine. L'archive contient le binaire `nixpacks` à sa racine.
ARG NIXPACKS_VERSION=1.30.0
RUN arch=$(uname -m) && \
    case "$arch" in \
      x86_64) NIXPACKS_ARCH="x86_64" ;; \
      aarch64) NIXPACKS_ARCH="aarch64" ;; \
      *) echo "Unsupported arch: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-${NIXPACKS_ARCH}-unknown-linux-musl.tar.gz" \
      | tar -xz -C /usr/local/bin nixpacks && \
    chmod +x /usr/local/bin/nixpacks && \
    nixpacks --version

# Application artifacts come after external tool installation so an ordinary
# source change reuses the expensive Ansible/Nixpacks layers.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist
COPY --chown=appuser:appgroup prisma ./prisma
COPY --chown=appuser:appgroup ansible ./ansible
ENV ANSIBLE_PLAYBOOKS_PATH=/app/ansible/playbooks

# Le service épingle les clés d'hôte SSH dans /app/.local. Seul ce répertoire
# doit être inscriptible ; les dépendances et artefacts applicatifs restent en
# lecture seule, ce qui évite une couche `chown -R` volumineuse.
RUN mkdir -p /app/.local/ssh && chown -R appuser:appgroup /app/.local

USER appuser

EXPOSE 3001

ENV NODE_ENV=production

# Schema changes are owned by the one-shot migrator service. API/worker
# containers never race migrations or seed work during ordinary restarts.
CMD ["node", "dist/main"]
