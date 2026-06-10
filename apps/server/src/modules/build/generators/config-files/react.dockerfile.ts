import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateReactDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 80;
  return [
    'FROM node:20-alpine AS builder',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci; else npm install; fi',
    'COPY . .',
    'RUN npm run build && if [ -d build ]; then cp -R build /tmp/web; elif [ -d dist ]; then cp -R dist /tmp/web; else mkdir -p /tmp/web; fi',
    '',
    'FROM nginx:alpine',
    'COPY --from=builder /tmp/web /usr/share/nginx/html',
    `EXPOSE ${port}`,
    `HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:${port} || exit 1`,
  ].join('\n');
}
