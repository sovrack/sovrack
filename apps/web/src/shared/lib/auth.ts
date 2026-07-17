export const AUTH_TOKEN_STORAGE_KEY = "deploy_automation_token";
export const AUTH_COOKIE_NAME = "deploy_automation_token";

export const clearAuthStorage = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  // Cleanup legacy token storage from previous frontend versions.
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);

  // Best effort cleanup for legacy non-HttpOnly cookie sessions.
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
};
