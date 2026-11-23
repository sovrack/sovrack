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

export type Theme = "light" | "dark" | "brand";

type ThemeContextValue = {
  theme: Theme;
  isLight: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
};

const THEME_STORAGE_KEY = "sovrack-theme";
const LEGACY_THEME_STORAGE_KEY = "deploy-automation-theme";
const DEFAULT_THEME: Theme = "dark";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  return value === "brand" || value === "dark" || value === "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("brand", "light", "dark");
  if (theme === "light") {
    root.classList.add("light");
    root.style.colorScheme = "light";
  } else {
    root.classList.add("dark");
    if (theme === "brand") root.classList.add("brand");
    root.style.colorScheme = "dark";
  }
}

function persistTheme(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function getInitialTheme(): Theme {
  const saved =
    localStorage.getItem(THEME_STORAGE_KEY) ||
    localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (isTheme(saved)) {
    return saved;
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initialTheme = getInitialTheme();
    setThemeState(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const nextTheme: Theme = currentTheme === "light" ? "dark" : "light";
      applyTheme(nextTheme);
      persistTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  const isLight = theme === "light";

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isLight,
      setTheme,
      toggleTheme,
      mounted,
    }),
    [isLight, mounted, setTheme, theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}

export const useTheme = useThemeContext;
