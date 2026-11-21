"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BRAND_CONFIG } from "@/shared/config/brand.config";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { useAuthStore } from "@/stores/auth.store";

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

// Pages dédiées réelles uniquement
const navLinks = [
  { href: publicSitePath("/features"), label: "Fonctionnalités" },
  { href: publicSitePath("/docs"), label: "Documentation" },
  { href: publicSitePath("/pricing"), label: "Tarifs" },
  { href: publicSitePath("/changelog"), label: "Changelog" },
];

export function MarketingNavbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isUserLoggedIn = mounted && isAuthenticated;

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6 sm:px-12 lg:px-24">
        {/* Logo & Navigation gauche */}
        <div className="flex items-center gap-8">
          <Link
            href={publicSitePath("/")}
            className="flex shrink-0 items-center transition-opacity hover:opacity-90"
            aria-label="Sovrack Accueil"
          >
            <SovrackBrand textClassName="text-[22px] font-bold tracking-tight text-white" />
          </Link>

          <nav className="hidden items-center gap-1.5 text-[14px] md:flex">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-[14px] font-medium transition-colors duration-150 ${
                    active
                      ? "text-[#2563EB]"
                      : "text-white hover:text-[#2563EB]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Côté droit : GitHub + Se connecter + Créer un compte */}
        <div className="hidden items-center gap-5 md:flex">
          <Link
            href={BRAND_CONFIG.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-white transition-colors hover:text-[#2563EB]"
            aria-label="Dépôt GitHub Sovrack"
            title="GitHub"
          >
            <GitHubIcon className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-4">
            {isUserLoggedIn ? (
              <Link
                href={customerAppPath("/dashboard")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#1d4ed8]"
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href={customerAppPath("/login")}
                  className="text-[14px] font-medium text-white transition-colors hover:text-[#2563EB]"
                >
                  Se connecter
                </Link>
                <Link
                  href={customerAppPath("/register")}
                  className="inline-flex h-8 items-center rounded-md bg-[#2563EB] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#1d4ed8]"
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Bouton Menu Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="p-2 text-zinc-300 hover:text-white focus:outline-none"
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Menu mobile déroulant */}
      {mobileMenuOpen && (
        <div className="bg-[#0a0a0a] px-6 py-4 md:hidden">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm ${
                  pathname === link.href ? "text-white font-medium" : "text-zinc-300 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 flex flex-col gap-2">
              <Link
                href={BRAND_CONFIG.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white py-1"
              >
                <GitHubIcon className="h-4 w-4" />
                <span>GitHub</span>
              </Link>
              <div className="mt-2">
                {isUserLoggedIn ? (
                  <Link
                    href={customerAppPath("/dashboard")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 w-full items-center justify-center rounded-md bg-[#2563EB] text-xs font-medium text-white hover:bg-[#1d4ed8]"
                  >
                    Dashboard →
                  </Link>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={customerAppPath("/login")}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex h-8 items-center justify-center rounded-md bg-[#161616] text-xs text-zinc-300 hover:text-white"
                    >
                      Se connecter
                    </Link>
                    <Link
                      href={customerAppPath("/register")}
                      onClick={() => setMobileMenuOpen(false)}
                      className="inline-flex h-8 items-center justify-center rounded-md bg-[#2563EB] text-xs font-medium text-white hover:bg-[#1d4ed8]"
                    >
                      Créer un compte
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
