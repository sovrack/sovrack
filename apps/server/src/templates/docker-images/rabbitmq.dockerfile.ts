import { DockerfileGenerateOptions } from '../../modules/build/generation/dockerfiles/dockerfile.types';

export function generateRabbitmqDockerfile(
  _options: DockerfileGenerateOptions,
): string {
  return ['FROM rabbitmq:3.13-management', 'EXPOSE 5672 15672'].join('\n');
}
