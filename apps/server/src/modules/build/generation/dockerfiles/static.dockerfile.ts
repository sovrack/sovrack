import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for static/dockerized/compose types — serves a static folder via nginx.
 */
export function generateStaticDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return [
    'FROM nginx:alpine',
    'COPY . /usr/share/nginx/html',
    'EXPOSE 80',
    'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost || exit 1',
  ].join('\n');
}
