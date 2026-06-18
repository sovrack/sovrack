import { DockerfileGenerateOptions } from './dockerfile.types';

export function generateRubyDockerfile(
  options: DockerfileGenerateOptions,
): string {
  const port = options.port ?? 3000;
  const rubyStartCmd =
    options.startCmd ??
    `bundle exec rails server -b 0.0.0.0 -p ${String(port)}`;
  return [
    'FROM ruby:3.3-alpine AS deps',
    'WORKDIR /app',
    'RUN apk add --no-cache build-base',
    'COPY Gemfile* ./',
    'RUN bundle install --without development test',
    '',
    'FROM ruby:3.3-alpine AS runner',
    'WORKDIR /app',
    'RUN apk add --no-cache curl',
    'RUN addgroup -g 1001 -S ruby && \\',
    '    adduser -u 1001 -S ruby -G ruby',
    'COPY --from=deps /usr/local/bundle /usr/local/bundle',
    'COPY --chown=ruby:ruby . .',
    'USER ruby',
    `EXPOSE ${port}`,
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\',
    `  CMD curl -f http://localhost:${port}/health || exit 1`,
    `CMD ["sh", "-c", "${rubyStartCmd}"]`,
  ].join('\n');
}
