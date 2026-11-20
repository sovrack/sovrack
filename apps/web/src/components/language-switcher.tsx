"use client";

import { useI18n } from "@/shared/i18n/language-context";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded-lg border border-border bg-card p-0.5 text-xs font-medium backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        onClick={() => setLang("fr")}
        aria-pressed={lang === "fr"}
        className={`rounded-md px-2 py-1 transition-all duration-200 ${
          lang === "fr"
            ? "border border-accent/50 bg-hover/20 text-accent font-semibold"
            : "text-secondary hover:text-primary hover:bg-hover/10"
        }`}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={`rounded-md px-2 py-1 transition-all duration-200 ${
          lang === "en"
            ? "border border-accent/50 bg-hover/20 text-accent font-semibold"
            : "text-secondary hover:text-primary hover:bg-hover/10"
        }`}
      >
        EN
      </button>
    </div>
  );
}
