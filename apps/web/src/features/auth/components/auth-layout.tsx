"use client";

import Link from "next/link";
import { SovrackBrand } from "@/components/marketing/sovrack-logo";

interface AuthLayoutProps {
  children: React.ReactNode;
  headerAction?: {
    label: string;
    href: string;
  };
}

/**
 * Layout d'authentification fixe et épuré.
 * - Fond identique au reste de l'application (bg-brand / #13111c).
 * - Barre supérieure sticky fixe à 100% en haut, ne bouge pas au défilement.
 * - Alignement vertical stable pour éviter les sauts entre login et inscription.
 * - Footer minimaliste avec liens légaux discrets.
 */
export function AuthLayout({ children, headerAction }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-brand text-white selection:bg-[#2563EB] selection:text-white">
      {/* Barre supérieure fixe en haut */}
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-white/10 bg-brand/90 px-6 backdrop-blur-md sm:px-10">
        <Link href="/" className="transition hover:opacity-90">
          <SovrackBrand textClassName="text-[18px] font-semibold text-white tracking-[-0.02em]" />
        </Link>
        {headerAction && (
          <Link
            href={headerAction.href}
            className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
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
      <footer className="flex flex-wrap items-center justify-center gap-6 border-t border-white/10 bg-brand/90 py-6 text-xs text-slate-500">
        <Link href="/terms" className="transition hover:text-slate-300">
          Conditions
        </Link>
        <Link href="/privacy" className="transition hover:text-slate-300">
          Confidentialité
        </Link>
        <Link href="/docs" className="transition hover:text-slate-300">
          Documentation
        </Link>
        <Link href="/status" className="transition hover:text-slate-300">
          Statut
        </Link>
      </footer>
    </div>
  );
}
