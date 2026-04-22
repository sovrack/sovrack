'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  const isDark = mounted
    ? theme === 'dark'
    : typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={
        isDark ? 'Activer le mode clair' : 'Activer le mode sombre'
      }
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
