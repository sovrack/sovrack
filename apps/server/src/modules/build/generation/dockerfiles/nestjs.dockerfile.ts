import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for both `nestjs` and `nodejs` types.
 */
export function generateNestjsDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  const startCmd = options.startCmd ?? 'dist/main.js';
  const isNestJs = options.type === 'nestjs';
  return [
    'FROM node:20-alpine AS builder',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci; else npm install; fi',
    'COPY . .',
    ...(isNestJs
      ? ['RUN npm run build']
      : ['RUN npm run build 2>/dev/null; true']
    ),
    '',
    'FROM node:20-alpine AS production',
    'WORKDIR /app',
    'RUN apk add --no-cache wget && addgroup -S app && adduser -S app -G app',
    'ENV NODE_ENV=production',
    'COPY --from=builder /app/dist ./dist',
    'COPY --from=builder /app/node_modules ./node_modules',
    'COPY package*.json ./',
    'USER app',
    `EXPOSE ${port}`,
    `HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${port}/health || exit 1`,
    `CMD ["node", "${startCmd}"]`,
  ].join('\n');
}
