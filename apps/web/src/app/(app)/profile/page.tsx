'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Legacy profile route: unified into /settings.
export default function ProfileRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/settings');
  }, [router]);

  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Loader2 size={20} className="animate-spin text-[var(--text-secondary)]" />
    </div>
  );
}
