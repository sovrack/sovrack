"use client";

import { Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "@/shared/hooks/use-theme";

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  const activeTheme = mounted ? theme : "brand";
  const nextLabel =
    activeTheme === "brand"
      ? "Mode sombre"
      : activeTheme === "dark"
        ? "Mode clair"
        : "Mode Sovrack";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Passer au ${nextLabel.toLowerCase()}`}
      title={nextLabel}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {activeTheme === "brand" ? (
        <Palette size={17} />
      ) : activeTheme === "dark" ? (
        <Moon size={17} />
      ) : (
        <Sun size={17} />
      )}
    </button>
  );
}
