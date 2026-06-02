import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateDefaultDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  return [
    'FROM alpine:latest',
    'WORKDIR /app',
    'COPY . .',
    `EXPOSE ${port}`,
  ].join('\n');
}
