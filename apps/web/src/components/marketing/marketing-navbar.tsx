"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, Settings, User, X } from "lucide-react";
import { useAuth } from "@/features/auth/api/use-auth";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { BRAND_CONFIG } from "@/shared/config/brand.config";
import { SovrackLogo } from "@/shared/ui/sovrack-logo";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

function GitHubIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
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

const productLinks = isCapabilityEnabled("publicMarketingCopy")
  ? [
      { href: publicSitePath("/#plateforme"), label: "La plateforme" },
      { href: publicSitePath("/#features"), label: "Fonctionnalités" },
      { href: publicSitePath("/#how-it-works"), label: "Comment ça marche" },
    ]
  : [];

const resourceLinks = [
  ...(isCapabilityEnabled("publicDocumentation")
    ? [{ href: publicSitePath("/docs"), label: "Documentation" }]
    : []),
  { href: publicSitePath("/security"), label: "Sécurité" },
  ...(isCapabilityEnabled("publicStatusPage")
    ? [{ href: publicSitePath("/status"), label: "État des services" }]
    : []),
  { href: publicSitePath("/legal"), label: "Informations légales" },
];

const publicPricingEnabled = isCapabilityEnabled("publicPricing");

const desktopLinks = [
  ...productLinks,
  ...(isCapabilityEnabled("publicDocumentation")
    ? [{ href: publicSitePath("/docs"), label: "Documentation" }]
    : []),
  ...(publicPricingEnabled
    ? [{ href: publicSitePath("/pricing"), label: "Tarifs" }]
    : []),
];

export function MarketingNavbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleLogout() {
    await logout();
    setProfileOpen(false);
    setMobileMenuOpen(false);
    window.location.assign(customerAppPath("/login"));
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-app/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex min-w-0 items-center">
          <Link
            href={publicSitePath("/")}
            className="flex shrink-0 items-center gap-2.5"
          >
            <SovrackLogo className="h-6 w-6 text-primary" />
            <span className="text-[17px] font-semibold tracking-tight text-primary">
              Sovrack
            </span>
          </Link>

          <nav className="ml-8 hidden items-center gap-6 text-sm text-secondary md:flex">
            {desktopLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname === link.href
                    ? "text-primary"
                    : "transition-colors hover:text-primary"
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href={BRAND_CONFIG.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[13px] font-medium text-secondary transition-colors hover:border-border-hover hover:text-primary"
          >
            <GitHubIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </Link>

          {isAuthenticated && user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2 text-[13px] font-medium text-primary transition-colors hover:border-border-hover"
                aria-expanded={profileOpen}
                aria-haspopup="true"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                  {user.fullName?.charAt(0).toUpperCase() || "?"}
                </span>
                <span className="hidden max-w-[110px] truncate sm:block">
                  {user.fullName?.split(" ")[0]}
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-card p-1.5 shadow-theme-lg">
                  <div className="border-b border-border px-3 py-2">
                    <div className="truncate text-sm font-semibold text-primary">
                      {user.fullName}
                    </div>
                    <div className="truncate text-xs text-secondary">
                      {user.email}
                    </div>
                  </div>
                  <Link
                    href={customerAppPath("/dashboard")}
                    className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover/10 hover:text-primary"
                    onClick={() => setProfileOpen(false)}
                  >
                    <User size={14} />
                    Mon espace
                  </Link>
                  <Link
                    href={customerAppPath("/settings/account")}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover/10 hover:text-primary"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings size={14} />
                    Paramètres
                  </Link>
                  {isAdmin && (
                    <Link
                      href={customerAppPath("/admin/teams")}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary transition-colors hover:bg-hover/10 hover:text-primary"
                      onClick={() => setProfileOpen(false)}
                    >
                      Workspace
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    <LogOut size={14} />
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href={customerAppPath("/login")}
                className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium text-secondary transition-colors hover:text-primary"
              >
                Se connecter
              </Link>
              <Link
                href={customerAppPath("/register")}
                className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                Créer un compte
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-hover/10 hover:text-primary md:hidden"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-app px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-1">
            {[...productLinks, ...resourceLinks].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-secondary transition-colors hover:bg-hover/10 hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
            {publicPricingEnabled && (
              <Link
                href={publicSitePath("/pricing")}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-2 py-2 text-sm text-secondary transition-colors hover:bg-hover/10 hover:text-primary"
              >
                Tarifs
              </Link>
            )}
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              {!isAuthenticated ? (
                <>
                  <Link
                    href={customerAppPath("/login")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[13px] font-medium text-secondary"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href={customerAppPath("/register")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-foreground"
                  >
                    Créer un compte
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={customerAppPath("/dashboard")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-[13px] font-medium text-secondary"
                  >
                    Mon espace
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium text-red-400"
                  >
                    Déconnexion
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
