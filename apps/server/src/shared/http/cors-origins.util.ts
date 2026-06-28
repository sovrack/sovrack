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
