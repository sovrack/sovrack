# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args passed at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_WS_URL=http://localhost:3001
ARG NEXT_PUBLIC_APP_NAME="platform"
ARG NEXT_PUBLIC_APP_VERSION="1.0.0"

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION

RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

ENV NODE_ENV=production

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# next.config.ts needed at runtime for rewrites, env, etc.
COPY next.config.ts ./

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["npm", "start"]
