"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/api/use-auth";

const marketingLinks = [
  { href: "/pricing", label: "Tarifs" },
  { href: "/docs", label: "Documentation" },
  { href: "/status", label: "Statut" },
  { href: "/legal", label: "Légal" },
];

export function MarketingNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isSuperAdmin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
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
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href={isSuperAdmin ? "/super_admin" : isAuthenticated ? "/dashboard" : "/"}
            className="flex items-center gap-2"
          >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
            <svg className="h-3.5 w-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            Sovrack
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <div className="flex items-center gap-6">
            {marketingLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition ${
                  pathname === l.href
                    ? "text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="ml-8 flex items-center gap-3 border-l border-white/10 pl-8">
            {isAuthenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 py-1.5 pl-2 pr-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white">
                    {user.fullName?.charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="hidden sm:block truncate max-w-[120px]">
                    {user.fullName?.split(" ")[0]}
                  </span>
                  <svg
                    className="h-4 w-4 text-zinc-500"
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

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="border-b border-zinc-800 px-3 py-2">
                      <div className="truncate text-sm font-semibold text-white">
                        {user.fullName}
                      </div>
                      <div className="truncate text-xs text-zinc-400">
                        {user.email}
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <Link
                        href="/super_admin"
                        className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                        onClick={() => setDropdownOpen(false)}
                      >
                        Back-office (plateforme)
                      </Link>
                    )}
                    <Link
                      href="/dashboard"
                      className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Mon espace
                    </Link>
                    <Link
                      href="/settings"
                      className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Paramètres
                    </Link>
                    {user.role === "OWNER" && (
                      <>
                        <Link
                          href="/admin/users"
                          className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Administration
                        </Link>
                        <Link
                          href="/admin/teams"
                          className="block rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Équipes
                        </Link>
                      </>
                    )}
                    <button
                      onClick={handleLogout}
                      className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                    >
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-zinc-300 transition hover:text-white"
                >
                  Connexion
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200"
                >
                  Créer mon compte
                </Link>
              </div>
            )}
          </div>
        </nav>

        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 md:hidden"
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
        <div className="border-t border-zinc-800 bg-zinc-950 px-6 py-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 pt-2 pb-4 border-b border-zinc-800">
              {marketingLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-medium ${
                    pathname === l.href
                      ? "text-white"
                      : "text-zinc-400 hover:text-white"
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
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-zinc-300 hover:text-white"
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg bg-white px-4 py-2.5 text-center font-semibold text-zinc-950"
                  >
                    Créer mon compte
                  </Link>
                </>
              )}
              {isAuthenticated && (
                <>
                  {isSuperAdmin && (
                    <Link
                      href="/super_admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-base font-medium text-zinc-300 hover:text-white"
                    >
                      Back-office (plateforme)
                    </Link>
                  )}
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-zinc-300 hover:text-white"
                  >
                    Mon espace
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-zinc-300 hover:text-white"
                  >
                    Paramètres
                  </Link>
                  {user?.role === "OWNER" && (
                    <>
                      <Link
                        href="/admin/users"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-base font-medium text-zinc-300 hover:text-white"
                      >
                        Administration
                      </Link>
                      <Link
                        href="/admin/teams"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-base font-medium text-zinc-300 hover:text-white"
                      >
                        Équipes
                      </Link>
                    </>
                  )}
                  <button
                    onClick={handleLogout}
                    className="text-left text-base font-medium text-red-400"
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