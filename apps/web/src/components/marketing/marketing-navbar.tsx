"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/api/use-auth";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { SovrackLogo } from "./sovrack-logo";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

const productLinks = isCapabilityEnabled("publicMarketingCopy")
  ? [
      { href: publicSitePath("/#plateforme"), label: "La plateforme" },
      { href: publicSitePath("/#features"), label: "Fonctionnalités" },
      { href: publicSitePath("/#how-it-works"), label: "Comment ça marche" },
    ]
  : [];

const resourcesLinks = [
  ...(isCapabilityEnabled("publicDocumentation")
    ? [{ href: publicSitePath("/docs"), label: "Documentation" }]
    : []),
  { href: publicSitePath("/legal"), label: "Légal" },
];

const publicPricingEnabled = isCapabilityEnabled("publicPricing");

export function MarketingNavbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
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
    setOpenMenu(null);
    setMobileMenuOpen(false);
    window.location.assign(customerAppPath("/login"));
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand/80 backdrop-blur-xl">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex flex-1">
          <Link
            href={publicSitePath("/")}
            className="group flex items-center gap-2.5"
          >
            <SovrackLogo
              size={64}
              className="-rotate-12 drop-shadow-[0_0_18px_rgba(0,229,255,0.5)]"
            />
            <span className="text-lg font-extrabold tracking-tight text-white group-hover:text-sky-100 transition">
              Deploy
              <span className="text-sky-300 group-hover:text-sky-200">Arc</span>
            </span>
          </Link>
        </div>

        <nav className="absolute left-[42%] hidden -translate-x-1/2 items-center md:flex">
          <div className="flex items-center gap-10" ref={menuRef}>
            {productLinks.length > 0 && (
              <div className="relative">
                <button
                  onMouseEnter={() => setOpenMenu("product")}
                  onClick={() =>
                    setOpenMenu((v) => (v === "product" ? null : "product"))
                  }
                  className={`flex items-center gap-1 text-base font-medium transition ${
                    openMenu === "product"
                      ? "text-white"
                      : "text-slate-100 hover:text-white"
                  }`}
                  aria-expanded={openMenu === "product"}
                  aria-haspopup="true"
                >
                  Produit
                  <svg
                    className={`h-4 w-4 transition ${openMenu === "product" ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {openMenu === "product" && (
                  <div
                    className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-white/15 bg-brand-light p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
                    onMouseEnter={() => setOpenMenu("product")}
                    onMouseLeave={() => setOpenMenu(null)}
                  >
                    {productLinks.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setOpenMenu(null)}
                        className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 hover:text-white"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <button
                onMouseEnter={() => setOpenMenu("resources")}
                onClick={() =>
                  setOpenMenu((v) => (v === "resources" ? null : "resources"))
                }
                className={`flex items-center gap-1 text-base font-medium transition ${
                  openMenu === "resources"
                    ? "text-white"
                    : "text-slate-100 hover:text-white"
                }`}
                aria-expanded={openMenu === "resources"}
                aria-haspopup="true"
              >
                Ressources
                <svg
                  className={`h-4 w-4 transition ${openMenu === "resources" ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {openMenu === "resources" && (
                <div
                  className="absolute left-0 top-full mt-2 w-56 rounded-xl border border-white/15 bg-brand-light p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
                  onMouseEnter={() => setOpenMenu("resources")}
                  onMouseLeave={() => setOpenMenu(null)}
                >
                  {resourcesLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpenMenu(null)}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        pathname === l.href
                          ? "text-white"
                          : "text-slate-200 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {publicPricingEnabled && (
              <Link
                href={publicSitePath("/pricing")}
                className={`relative text-base font-medium transition ${
                  pathname === "/pricing"
                    ? "text-white"
                    : "text-slate-100 hover:text-white"
                }`}
              >
                Tarifs
                {pathname === "/pricing" && (
                  <span className="absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full bg-sky-400" />
                )}
              </Link>
            )}
          </div>
        </nav>

        <div className="hidden flex-1 items-center md:flex md:justify-end">
          {isAuthenticated && user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() =>
                  setOpenMenu((v) => (v === "profile" ? null : "profile"))
                }
                className={`flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-1.5 pl-2 pr-3 text-sm font-medium text-white transition hover:border-sky-300/50 focus:outline-none focus:ring-2 focus:ring-sky-400 ${
                  openMenu === "profile" ? "border-sky-300/50" : ""
                }`}
                aria-expanded={openMenu === "profile"}
                aria-haspopup="true"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-xs font-bold text-white">
                  {user.fullName?.charAt(0).toUpperCase() || "?"}
                </span>
                <span className="hidden max-w-[120px] truncate sm:block">
                  {user.fullName?.split(" ")[0]}
                </span>
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {openMenu === "profile" && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-brand-light p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150">
                  <div className="border-b border-white/10 px-3 py-2">
                    <div className="truncate text-sm font-semibold text-white">
                      {user.fullName}
                    </div>
                    <div className="truncate text-xs text-sky-300">
                      {user.email}
                    </div>
                  </div>
                  <Link
                    href={customerAppPath("/dashboard")}
                    className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 hover:text-white"
                    onClick={() => setOpenMenu(null)}
                  >
                    Mon espace
                  </Link>
                  <Link
                    href={customerAppPath("/settings/account")}
                    className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 hover:text-white"
                    onClick={() => setOpenMenu(null)}
                  >
                    Paramètres
                  </Link>
                  {isAdmin && (
                    <Link
                      href={customerAppPath("/admin/teams")}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-white/5 hover:text-white"
                      onClick={() => setOpenMenu(null)}
                    >
                      Workspace
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10"
                  >
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href={customerAppPath("/login")}
                className="rounded-lg px-4 py-2 text-base font-medium text-slate-100 transition hover:text-white"
              >
                Se connecter
              </Link>
              <Link
                href={customerAppPath("/register")}
                className="rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110"
              >
                S&apos;inscrire
              </Link>
            </div>
          )}
        </div>

        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-100 hover:bg-white/5 md:hidden"
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {mobileMenuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-brand px-6 py-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-4 pt-2">
              {publicPricingEnabled && (
                <Link
                  href={publicSitePath("/pricing")}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-medium ${
                    pathname === "/pricing"
                      ? "text-white"
                      : "text-slate-100 hover:text-white"
                  }`}
                >
                  Tarifs
                </Link>
              )}
              {[...productLinks, ...resourcesLinks].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-medium ${
                    pathname === l.href
                      ? "text-white"
                      : "text-slate-100 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {!isAuthenticated && (
                <>
                  <Link
                    href={customerAppPath("/login")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-slate-100 hover:text-white"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href={customerAppPath("/register")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2.5 text-center font-semibold text-white"
                  >
                    S&apos;inscrire
                  </Link>
                </>
              )}
              {isAuthenticated && (
                <>
                  <Link
                    href={customerAppPath("/dashboard")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-slate-100 hover:text-white"
                  >
                    Mon espace
                  </Link>
                  <Link
                    href={customerAppPath("/settings/account")}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-slate-100 hover:text-white"
                  >
                    Paramètres
                  </Link>
                  {isAdmin && (
                    <Link
                      href={customerAppPath("/admin/teams")}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-base font-medium text-slate-100 hover:text-white"
                    >
                      Workspace
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="text-left text-base font-medium text-red-300"
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
