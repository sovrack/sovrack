import { DockerfileGenerateOptions } from '../../modules/build/generation/dockerfiles/dockerfile.types';

export function generateMysqlDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM mysql:8.0', 'EXPOSE 3306'].join('\n');
}
