export const AUTH_TOKEN_STORAGE_KEY = 'devops_platform_token';
export const AUTH_COOKIE_NAME = 'devops_platform_token';

export type DecodedJwtPayload = {
  exp?: number;
  iat?: number;
  id?: string;
  email?: string;
  role?: 'ADMIN' | 'DEVELOPER';
};

function setAuthCookie(token: string): void {
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

function clearAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; Max-Age=0; SameSite=Lax`;
}

export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

export const persistToken = (token: string): void => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  setAuthCookie(token);
};

export const clearAuthStorage = (): void => {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  clearAuthCookie();
};

export const hasToken = (): boolean => {
  return getToken() !== null;
};

// Decode JWT côté client sans validation cryptographique.
export const decodeToken = (
  token: string,
): DecodedJwtPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload) as DecodedJwtPayload;
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
};

export const isTokenExpired = (token: string): boolean => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  return Date.now() >= decoded.exp * 1000;
};
