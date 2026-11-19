export const AUTH_TOKEN_STORAGE_KEY = "sovrack_token";
export const AUTH_COOKIE_NAME = "sovrack_token";
export const AUTH_COOKIE_NAME_LEGACY = "deploy_automation_token";

export const clearAuthStorage = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  // Cleanup legacy token storage from previous frontend versions.
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_COOKIE_NAME_LEGACY);

  // Best effort cleanup for legacy non-HttpOnly cookie sessions.
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${AUTH_COOKIE_NAME_LEGACY}=; path=/; Max-Age=0; SameSite=Lax`;
};
