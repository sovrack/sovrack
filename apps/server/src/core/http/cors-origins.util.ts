import { ConfigService } from '@nestjs/config';

/**
 * Pour les services NestJS avec injection de dépendances.
 */
export function resolveCorsOrigins(config: ConfigService): string[] {
  const urls = config.get<string>('FRONTEND_URLS', '');
  const url  = config.get<string>('FRONTEND_URL', '');
  return [
    ...urls.split(',').filter(Boolean),
    url,
  ].filter(Boolean);
}

/**
 * Pour les décorateurs @WebSocketGateway — évalués avant l'initialisation DI.
 * Lit process.env directement, ce qui est la seule option dans un contexte de décorateur.
 */
export function resolveGatewayCorsOrigins(): string[] {
  const envOrigins = [process.env.FRONTEND_URLS, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return envOrigins.length > 0
    ? Array.from(new Set(envOrigins))
    : ['http://localhost:3000', 'http://localhost:3002'];
}
