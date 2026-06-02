export const AUTH_TOKEN_STORAGE_KEY = 'devops_platform_token';
export const AUTH_COOKIE_NAME = 'devops_platform_token';
export const COOKIE_SESSION_TOKEN = '__cookie_session__';

export const clearAuthStorage = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  // Cleanup legacy token storage from previous frontend versions.
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);

  // Best effort cleanup for legacy non-HttpOnly cookie sessions.
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
};
