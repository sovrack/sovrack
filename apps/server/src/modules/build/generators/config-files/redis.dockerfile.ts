import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateRedisDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM redis:7-alpine', 'EXPOSE 6379'].join('\n');
}
