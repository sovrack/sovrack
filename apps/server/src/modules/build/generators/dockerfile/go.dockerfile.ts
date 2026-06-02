import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for both `go` and `golang` types.
 */
export function generateGoDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  const startCmd = options.startCmd ?? './main';
  return [
    'FROM golang:1.22-alpine AS builder',
    'WORKDIR /app',
    'COPY go.mod go.sum ./',
    'RUN go mod download',
    'COPY . .',
    'RUN CGO_ENABLED=0 GOOS=linux go build -o main .',
    '',
    'FROM alpine:3.19 AS runner',
    'RUN apk --no-cache add ca-certificates wget',
    'RUN addgroup -g 1001 -S appgroup && \\',
    '    adduser -u 1001 -S appuser -G appgroup',
    'WORKDIR /app',
    'COPY --from=builder --chown=appuser:appgroup /app/main .',
    'USER appuser',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\',
    `  CMD wget -qO- http://localhost:${port}/health || exit 1`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join('\n');
}
