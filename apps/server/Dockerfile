# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM ghcr.io/sovrack/server:latest AS runner

USER root
WORKDIR /app

# Copy pruned production dependencies and compiled artifacts from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:appgroup --from=builder /app/dist ./dist

USER appuser

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/main"]
