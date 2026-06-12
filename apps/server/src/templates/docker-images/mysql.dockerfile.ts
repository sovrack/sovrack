import { DockerfileGenerateOptions } from '../../modules/build/generators/config-files/dockerfile.types';

export function generateMysqlDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM mysql:8.0', 'EXPOSE 3306'].join('\n');
}
