import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateRustDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  const startCmd = options.startCmd ?? './app';
  return [
    'FROM rust:1.77-alpine AS builder',
    'WORKDIR /app',
    'RUN apk add --no-cache musl-dev',
    'COPY Cargo.toml Cargo.lock ./',
    'RUN mkdir src && echo "fn main() {}" > src/main.rs',
    'RUN cargo build --release',
    'RUN rm src/main.rs',
    'COPY src ./src',
    'RUN touch src/main.rs && cargo build --release',
    '',
    'FROM alpine:3.19 AS runner',
    'RUN apk --no-cache add ca-certificates wget',
    'RUN addgroup -g 1001 -S rust && \\',
    '    adduser -u 1001 -S rust -G rust',
    'WORKDIR /app',
    'COPY --from=builder --chown=rust:rust /app/target/release/app .',
    'USER rust',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\',
    `  CMD wget -qO- http://localhost:${port}/health || exit 1`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join('\n');
}
