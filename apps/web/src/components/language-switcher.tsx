"use client";

import { useI18n } from "@/shared/i18n/language-context";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-xs font-medium backdrop-blur-md ${className}`}
    >
      <button
        type="button"
        onClick={() => setLang("fr")}
        aria-pressed={lang === "fr"}
        className={`rounded-md px-2 py-1 transition-all duration-200 ${
          lang === "fr"
            ? "border border-cyan-400/40 bg-white/15 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] font-semibold"
            : "text-slate-300 hover:text-white hover:bg-white/5"
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
            ? "border border-cyan-400/40 bg-white/15 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)] font-semibold"
            : "text-slate-300 hover:text-white hover:bg-white/5"
        }`}
      >
        EN
      </button>
    </div>
  );
}
