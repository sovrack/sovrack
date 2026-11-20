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
 * Layout d'authentification minimaliste haute précision (style Vercel).
 * - Barre supérieure épurée avec logo Sovrack et lien de bascule.
 * - Conteneur centré sur fond noir profond sans distraction.
 * - Footer minimaliste avec liens légaux essentiels.
 */
export function AuthLayout({ children, headerAction }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#050508] text-zinc-100 selection:bg-sky-500 selection:text-white">
      {/* Barre supérieure minimale */}
      <header className="flex h-16 w-full items-center justify-between border-b border-zinc-900/80 px-6 sm:px-10">
        <Link href="/" className="transition hover:opacity-90">
          <SovrackBrand textClassName="text-[17px] font-semibold text-white tracking-[-0.02em]" />
        </Link>
        {headerAction && (
          <Link
            href={headerAction.href}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
          >
            {headerAction.label}
          </Link>
        )}
      </header>

      {/* Conteneur principal centré */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>

      {/* Pied de page minimaliste style Vercel */}
      <footer className="flex flex-wrap items-center justify-center gap-6 border-t border-zinc-900/80 py-6 text-xs text-zinc-500">
        <Link href="/terms" className="transition hover:text-zinc-300">
          Conditions
        </Link>
        <Link href="/privacy" className="transition hover:text-zinc-300">
          Confidentialité
        </Link>
        <Link href="/docs" className="transition hover:text-zinc-300">
          Documentation
        </Link>
        <Link href="/status" className="transition hover:text-zinc-300">
          Statut
        </Link>
      </footer>
    </div>
  );
}
