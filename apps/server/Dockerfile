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
RUN apk add --no-cache python3 ansible-core openssh-client curl ca-certificates

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Built app
COPY --from=builder /app/dist ./dist

# Prisma schema for migrations
COPY prisma ./prisma

# Ansible playbooks — embarqués dans le repo backend (self-contained).
# Résolus via ANSIBLE_PLAYBOOKS_PATH (cf. ENV plus bas).
COPY ansible ./ansible
ENV ANSIBLE_PLAYBOOKS_PATH=/app/ansible/playbooks

# Install ONLY the collections we use into a world-readable system path so the
# non-root runtime user (appuser) finds them. /usr/share/ansible/collections is
# already on ansible-core's default COLLECTIONS_PATH; we also export it to be safe.
RUN ansible-galaxy collection install -r ansible/requirements.yml \
      -p /usr/share/ansible/collections
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

# Donner la possession à appuser
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed-staff.js && node dist/main"]
