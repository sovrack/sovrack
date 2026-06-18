import { DockerfileGenerateOptions } from '../../modules/build/generation/dockerfiles/dockerfile.types';

export function generateRedisDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM redis:7-alpine', 'EXPOSE 6379'].join('\n');
}
