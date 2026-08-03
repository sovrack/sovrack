"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/api/use-auth";

const marketingLinks = [
  { href: "/pricing", label: "Tarifs" },
  { href: "/docs", label: "Documentation" },
  { href: "/status", label: "Statut" },
];

export function MarketingNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
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
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          href={isAuthenticated ? "/dashboard" : "/"}
          className="flex items-center gap-2"
        >
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-lg font-bold text-transparent">
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
                    ? "text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4 ml-8 border-l border-slate-100 pl-8">
            {isAuthenticated && user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-2 pr-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white">
                    {user.fullName?.charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="hidden sm:block truncate max-w-[120px]">
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

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="border-b border-slate-100 px-3 py-2">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {user.fullName}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {user.email}
                      </div>
                    </div>
                    <Link
                      href="/dashboard"
                      className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Mon espace
                    </Link>
                    <Link
                      href="/settings"
                      className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Paramètres
                    </Link>
                    {user.role === "ADMIN" && (
                      <>
                        <Link
                          href="/admin/users"
                          className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Administration
                        </Link>
                        <Link
                          href="/admin/teams"
                          className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => setDropdownOpen(false)}
                        >
                          Équipes
                        </Link>
                      </>
                    )}
                    <button
                      onClick={handleLogout}
                      className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
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
                  className="text-sm font-medium text-slate-700 hover:text-slate-900"
                >
                  Connexion
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  Créer mon compte
                </Link>
              </div>
            )}
          </div>
        </nav>

        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 md:hidden"
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
        <div className="border-t border-slate-100 bg-white px-6 py-4 md:hidden animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 pt-2 pb-4 border-b border-slate-100">
              {marketingLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-base font-medium ${
                    pathname === l.href
                      ? "text-slate-900"
                      : "text-slate-600 hover:text-slate-900"
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
                    className="text-base font-medium text-slate-700 hover:text-slate-900"
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-center font-semibold text-white"
                  >
                    Créer mon compte
                  </Link>
                </>
              )}
              {isAuthenticated && (
                <>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-slate-700 hover:text-slate-900"
                  >
                    Mon espace
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-base font-medium text-slate-700 hover:text-slate-900"
                  >
                    Paramètres
                  </Link>
                  {user?.role === "ADMIN" && (
                    <>
                      <Link
                        href="/admin/users"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-base font-medium text-slate-700 hover:text-slate-900"
                      >
                        Administration
                      </Link>
                      <Link
                        href="/admin/teams"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-base font-medium text-slate-700 hover:text-slate-900"
                      >
                        Équipes
                      </Link>
                    </>
                  )}
                  <button
                    onClick={handleLogout}
                    className="text-left text-base font-medium text-red-600"
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