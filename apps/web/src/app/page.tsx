'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/use-auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (isAuthenticated) {
      router.replace('/dashboard');
      return;
    }

    router.replace('/login');
  }, [isAuthenticated, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">DevOps Platform</h1>
        <p className="text-[var(--text-secondary)]">Loading...</p>
      </div>
    </div>
  );
}
