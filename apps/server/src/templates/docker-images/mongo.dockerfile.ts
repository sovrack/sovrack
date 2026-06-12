import { DockerfileGenerateOptions } from '../../modules/build/generators/config-files/dockerfile.types';

export function generateMongoDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM mongo:7', 'EXPOSE 27017'].join('\n');
}
