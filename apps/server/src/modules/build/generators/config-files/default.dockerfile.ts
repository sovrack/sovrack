import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateDefaultDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  return [
    'FROM alpine:latest',
    'WORKDIR /app',
    'RUN addgroup -S appgroup && adduser -S appuser -G appgroup',
    'COPY --chown=appuser:appgroup . .',
    'USER appuser',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\',
    `  CMD wget -qO- http://localhost:${port}/health || exit 1`,
    `CMD ["sh", "-c", "${options.startCmd ?? '# no start command specified'}"]`,
  ].join('\n');
}
