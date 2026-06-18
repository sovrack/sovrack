import { DockerfileGenerateOptions } from './dockerfile.types';

/**
 * Used for both `php` and `laravel` types.
 * Port and startCmd defaults differ.
 */
export function generatePhpDockerfile(
  options: DockerfileGenerateOptions,
  isLaravel = false,
): string {
  const exposedPort = options.port ?? (isLaravel ? 8000 : 80);
  const defaultCmd = isLaravel
    ? `php artisan serve --host=0.0.0.0 --port=${String(exposedPort)}`
    : 'php-fpm';
  const startCmd = options.startCmd ?? defaultCmd;
  return [
    'FROM composer:2 AS deps',
    'WORKDIR /app',
    'COPY composer.* ./',
    'RUN composer install --no-dev --no-scripts --no-autoloader',
    '',
    'FROM php:8.3-fpm-alpine AS runner',
    'WORKDIR /var/www/html',
    'RUN apk add --no-cache curl',
    'RUN addgroup -g 1001 -S appgroup && \\',
    '    adduser -u 1001 -S appuser -G appgroup',
    'COPY --from=deps /app/vendor ./vendor',
    'COPY --chown=appuser:appgroup . .',
    'RUN docker-php-ext-install pdo pdo_mysql',
    'RUN cd /var/www/html && composer dump-autoload --optimize --no-scripts || true',
    'USER appuser',
    `EXPOSE ${exposedPort}`,
    'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\',
    `  CMD curl -f http://localhost:${exposedPort}/health || exit 1`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join('\n');
}

export function generateLaravelDockerfile(
  options: DockerfileGenerateOptions,
): string {
  return generatePhpDockerfile(options, true);
}
