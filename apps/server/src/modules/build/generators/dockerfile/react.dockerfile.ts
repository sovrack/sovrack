import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateReactDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return [
    'FROM node:20-alpine AS builder',
    'WORKDIR /app',
    'COPY package*.json ./',
    'RUN npm ci',
    'COPY . .',
    'RUN npm run build && if [ -d build ]; then cp -R build /tmp/web; elif [ -d dist ]; then cp -R dist /tmp/web; else mkdir -p /tmp/web; fi',
    '',
    'FROM nginx:alpine',
    'COPY --from=builder /tmp/web /usr/share/nginx/html',
    'EXPOSE 80',
    'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost || exit 1',
  ].join('\n');
}
