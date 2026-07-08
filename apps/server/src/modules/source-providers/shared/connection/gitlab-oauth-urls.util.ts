import {
  normalizeGitlabBaseUrl,
  normalizeOptional,
} from './git-provider-config.util';

export { normalizeGitlabBaseUrl, normalizeOptional };

export function resolveGitlabProviderRedirectUri(
  existingUri: string | null | undefined,
  callbackBaseUrl: string,
): string {
  const resolved = normalizeOptional(existingUri);
  if (resolved) return resolved;
  return `${callbackBaseUrl.replace(/\/+$/, '')}/gitlab/callback`;
}

export function buildFrontendSettingsRedirect(
  frontendBaseUrl: string,
  status: 'success' | 'error',
  message?: string,
  providerId?: string,
): string {
  const base = frontendBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/settings/git`);
  url.searchParams.set('oauth', status);
  if (providerId) url.searchParams.set('provider_id', providerId);
  if (message) url.searchParams.set('oauth_message', message);
  return url.toString();
}
