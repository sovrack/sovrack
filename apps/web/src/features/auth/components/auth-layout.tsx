"use client";

import Link from "next/link";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";

interface AuthLayoutProps {
  children: React.ReactNode;
  headerAction?: {
    label: string;
    href: string;
  };
}

/**
 * Layout d'authentification fixe et épuré.
 * - Fond identique au reste de l'application (bg-app / #0a0a0a).
 * - Barre supérieure sticky fixe à 100% en haut, ne bouge pas au défilement.
 * - Alignement vertical stable pour éviter les sauts entre login et inscription.
 * - Footer minimaliste avec liens légaux discrets.
 */
export function AuthLayout({ children, headerAction }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-app text-primary selection:bg-accent selection:text-accent-foreground">
      {/* Barre supérieure fixe en haut */}
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-border bg-app/90 px-6 backdrop-blur-md sm:px-10">
        <Link href="/" className="transition hover:opacity-90">
          <SovrackBrand textClassName="text-[18px] font-semibold text-primary tracking-[-0.02em]" />
        </Link>
        {headerAction && (
          <Link
            href={headerAction.href}
            className="rounded-lg border border-border bg-hover/10 px-3.5 py-1.5 text-xs font-medium text-primary transition hover:bg-hover/15 hover:text-primary"
          >
            {headerAction.label}
          </Link>
        )}
      </header>

      {/* Conteneur principal centré avec point d'ancrage stable en haut */}
      <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>

      {/* Pied de page minimaliste */}
      <footer className="flex flex-wrap items-center justify-center gap-6 border-t border-border bg-app/90 py-6 text-xs text-muted">
        <Link href="/terms" className="transition hover:text-secondary">
          Conditions
        </Link>
        <Link href="/privacy" className="transition hover:text-secondary">
          Confidentialité
        </Link>
        <Link href="/docs" className="transition hover:text-secondary">
          Documentation
        </Link>
        <Link href="/status" className="transition hover:text-secondary">
          Statut
        </Link>
      </footer>
    </div>
  );
}
