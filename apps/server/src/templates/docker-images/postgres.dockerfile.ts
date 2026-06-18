import { DockerfileGenerateOptions } from '../../modules/build/generation/dockerfiles/dockerfile.types';

export function generatePostgresDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM postgres:16-alpine', 'EXPOSE 5432'].join('\n');
}
