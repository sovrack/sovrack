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

RUN apk add --no-cache python3 ansible openssh-client curl ca-certificates

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

# Ansible playbooks (mounted at runtime via volume or baked in)
COPY ../devops/ansible ./devops/ansible 2>/dev/null || true

# ── Install Nixpacks (used by NixpacksService for local builds + plan generation) ──
# Nixpacks is a single static binary (~50MB) — no runtime deps, no Nix daemon required.
# It auto-detects the language/framework and generates a Dockerfile.
# See: https://github.com/railwayapp/nixpacks
ARG NIXPACKS_VERSION=1.30.0
RUN arch=$(uname -m) && \
    case "$arch" in \
      x86_64) NIXPACKS_ARCH="amd64" ;; \
      aarch64) NIXPACKS_ARCH="arm64" ;; \
      *) echo "Unsupported arch: $arch" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-linux-${NIXPACKS_ARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin nixpacks && \
    chmod +x /usr/local/bin/nixpacks && \
    nixpacks --version

EXPOSE 3001

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
