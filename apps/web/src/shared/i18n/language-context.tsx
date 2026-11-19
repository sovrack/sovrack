"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FR } from "./translations";

export type Language = "en" | "fr";

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  /** Traduit un texte source anglais ; retombe sur l'anglais si non traduit. */
  t: (text: string) => string;
  mounted: boolean;
};

const LANG_STORAGE_KEY = "sovrack-lang";
const DEFAULT_LANG: Language = "fr";

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(DEFAULT_LANG);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY) as Language | null;
      if (stored === "en" || stored === "fr") {
        setLangState(stored);
        document.documentElement.lang = stored;
      } else {
        localStorage.setItem(LANG_STORAGE_KEY, DEFAULT_LANG);
        document.documentElement.lang = DEFAULT_LANG;
      }
    } catch {
      // Fallback in case localStorage is restricted
    }
    setMounted(true);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      // Ignore storage errors
    }
  }, []);

  const t = useCallback(
    (text: string) => (lang === "fr" ? (FR[text] ?? text) : text),
    [lang],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t, mounted }),
    [lang, setLang, t, mounted],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// Fallback français quand aucun provider n'est monté — permet aux
// tests unitaires de rendre les composants sans wrapper, et l'adoption
// incrémentale de t() sans risque de crash.
const FALLBACK: LanguageContextValue = {
  lang: "fr",
  setLang: () => undefined,
  t: (text) => FR[text] ?? text,
  mounted: true,
};

export function useI18n() {
  return useContext(LanguageContext) ?? FALLBACK;
}

export const useLanguage = useI18n;

