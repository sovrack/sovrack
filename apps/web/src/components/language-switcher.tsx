'use client';

import { useI18n } from '@/contexts/i18n-context';
import type { Locale } from '@/i18n';

const FLAG: Record<Locale, string> = {
  en: '🇬🇧',
  fr: '🇫🇷',
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  const next: Locale = locale === 'en' ? 'fr' : 'en';

  return (
    <button
      onClick={() => setLocale(next)}
      title={`${t.language.label}: ${t.language[next]}`}
      aria-label={`Switch to ${t.language[next]}`}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
    >
      {FLAG[locale]}
    </button>
  );
}
