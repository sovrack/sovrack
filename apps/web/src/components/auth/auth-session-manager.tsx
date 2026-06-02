'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AUTH_UNAUTHORIZED_EVENT, registerUnauthorizedHandler } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

const LOGIN_ROUTE = '/login';

function isLoginPath(pathname: string): boolean {
  return pathname.startsWith('/login') || pathname.startsWith('/auth/login');
}

export function AuthSessionManager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const initialize = useAuthStore((state) => state.initialize);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAuth();

      if (pathname && !isLoginPath(pathname)) {
        const nextPath = `${window.location.pathname}${window.location.search}`;
        router.replace(`${LOGIN_ROUTE}?next=${encodeURIComponent(nextPath)}`);
      }
    };

    registerUnauthorizedHandler(handleUnauthorized);
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      registerUnauthorizedHandler(null);
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [clearAuth, pathname, router]);

  return <>{children}</>;
}
