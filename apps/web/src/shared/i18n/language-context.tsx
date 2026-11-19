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

const LANG_STORAGE_KEY = "deploy-automation-lang";
const DEFAULT_LANG: Language = "fr";

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(DEFAULT_LANG);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // La V1 publique est livrée en français. Le moteur reste prêt pour un
    // futur catalogue anglais complet, mais aucun sélecteur incomplet n'est
    // exposé aux clients.
    setLangState(DEFAULT_LANG);
    localStorage.setItem(LANG_STORAGE_KEY, DEFAULT_LANG);
    document.documentElement.lang = DEFAULT_LANG;
    setMounted(true);
  }, []);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
    document.documentElement.lang = next;
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
