'use client';

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api, {
  AUTH_UNAUTHORIZED_EVENT,
  getApiErrorMessage,
  registerUnauthorizedHandler,
} from '@/lib/api';
import {
  clearAuthStorage,
  getToken,
  isTokenExpired,
  persistToken,
} from '@/lib/auth';
import type { AuthUser, LoginResponse } from '@/types/auth';

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

const LOGIN_ROUTE = '/auth/login/developer';

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = useCallback((redirectToLogin = true) => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
    setError(null);

    if (redirectToLogin && pathname && !pathname.startsWith('/auth/login')) {
      router.replace(LOGIN_ROUTE);
    }
  }, [pathname, router]);

  const refreshUser = useCallback(async () => {
    const currentToken = getToken();

    if (!currentToken || isTokenExpired(currentToken)) {
      handleLogout(false);
      setLoading(false);
      return;
    }

    try {
      const response = await api.get<AuthUser>('/auth/me');
      setToken(currentToken);
      setUser(response.data);
      setError(null);
    } catch (authError) {
      setError(getApiErrorMessage(authError));
      handleLogout(false);
    } finally {
      setLoading(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      handleLogout(false);

      if (pathname && !pathname.startsWith('/auth/login')) {
        router.replace(LOGIN_ROUTE);
      }
    });

    const handleUnauthorized = () => {
      handleLogout(false);

      if (pathname && !pathname.startsWith('/auth/login')) {
        router.replace(LOGIN_ROUTE);
      }
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      registerUnauthorizedHandler(null);
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [handleLogout, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      persistToken(response.data.access_token);
      setToken(response.data.access_token);
      setUser(response.data.user);
      setError(null);
    } catch (loginError) {
      const message = getApiErrorMessage(loginError);
      setError(message);
      throw loginError;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    handleLogout();
  }, [handleLogout]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      error,
      isAuthenticated: Boolean(token && user),
      isAdmin: user?.role === 'ADMIN',
      login,
      logout,
      refreshUser,
      clearError,
    }),
    [token, user, loading, error, login, logout, refreshUser, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
}
