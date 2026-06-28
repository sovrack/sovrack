/**
 * Construit l'URL de clone Git HTTPS, en injectant le token d'accès si présent
 * (`https://oauth2:<token>@host/...`). Extrait de DockerDeployExecutorService
 * (1re étape sûre de découpe du god-service) — comportement identique, pur et
 * testable. Sécurité : le token n'est injecté que pour les URL https://.
 */
export function buildAuthenticatedCloneUrl(
  providerUrl: string,
  repoPath: string,
  token: string,
): string {
  const base = `${providerUrl.replace(/\/$/, '')}/${repoPath}.git`;
  return token && providerUrl
    ? base.replace('https://', `https://oauth2:${token}@`)
    : base;
}
