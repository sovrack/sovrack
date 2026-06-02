'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Redirects to /terminal (moved from Settings to Operations section)
export default function TerminalSettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/terminal');
  }, [router]);

  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Loader2 size={20} className="animate-spin text-[var(--text-secondary)]" />
    </div>
  );
}
