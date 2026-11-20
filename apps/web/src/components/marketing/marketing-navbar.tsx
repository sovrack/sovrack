"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "@/features/auth/api/use-auth";
import { BRAND_CONFIG } from "@/shared/config/brand.config";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

const navLinks = [
  { href: publicSitePath("/features"), label: "Fonctionnalités" },
  { href: publicSitePath("/architecture"), label: "Architecture" },
  { href: publicSitePath("/docs"), label: "Documentation" },
  { href: publicSitePath("/pricing"), label: "Tarifs" },
  { href: publicSitePath("/changelog"), label: "Changelog" },
];

export function MarketingNavbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-app/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo & Navigation gauche */}
        <div className="flex items-center gap-7">
          <Link
            href={publicSitePath("/")}
            className="flex shrink-0 items-center transition-opacity hover:opacity-90"
            aria-label="Sovrack Accueil"
          >
            <SovrackBrand textClassName="text-[16px] font-normal tracking-[-0.02em] text-white" />
          </Link>

          <nav className="hidden items-center gap-5 text-[13px] md:flex">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors duration-150 ${
                    active
                      ? "text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Côté droit : GitHub + Authentification */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={BRAND_CONFIG.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-zinc-400 transition-colors hover:text-white"
            aria-label="Dépôt GitHub Sovrack"
            title="GitHub"
          >
            <GitHubIcon className="h-4 w-4" />
          </Link>

          {isAuthenticated ? (
            <Link
              href={customerAppPath("/dashboard")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover shadow-sm"
            >
              <span>Tableau de bord</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href={customerAppPath("/login")}
                className="h-8 px-2.5 text-[13px] font-normal text-zinc-300 transition-colors hover:text-white inline-flex items-center"
              >
                Se connecter
              </Link>
              <Link
                href={customerAppPath("/register")}
                className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white transition-colors hover:bg-accent-hover shadow-sm"
              >
                Créer un compte
              </Link>
            </div>
          )}
        </div>

        {/* Bouton Menu Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 text-zinc-400 hover:text-white focus:outline-none"
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Menu mobile déroulant */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-app px-5 py-4 md:hidden">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm ${
                  pathname === link.href ? "text-white font-medium" : "text-zinc-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-border/80 flex flex-col gap-2">
              <Link
                href={BRAND_CONFIG.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white py-1"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>GitHub</span>
              </Link>
              {isAuthenticated ? (
                <Link
                  href={customerAppPath("/dashboard")}
                  onClick={() => setMobileMenuOpen(false)}
                  className="mt-2 inline-flex h-8 items-center justify-center rounded-md bg-accent text-xs font-medium text-white hover:bg-accent-hover"
                >
                  Tableau de bord →
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Link
                    href={customerAppPath("/login")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card text-xs text-zinc-300 hover:text-white"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href={customerAppPath("/register")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-accent text-xs font-medium text-white hover:bg-accent-hover"
                  >
                    Créer un compte
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
