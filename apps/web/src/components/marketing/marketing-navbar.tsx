"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/auth/api/use-auth";

export function MarketingNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/pricing", label: "Tarifs" },
    { href: "/docs", label: "Documentation" },
    { href: "/status", label: "Statut" },
  ];

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
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

        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`transition hover:text-slate-900 ${
                pathname === l.href ? "text-slate-900" : ""
              }`}
            >
              {l.label}
            </Link>
          ))}

          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-medium text-slate-700 transition hover:border-slate-300"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white">
                  {user.fullName?.charAt(0).toUpperCase() || "?"}
                </span>
                {user.fullName?.split(" ")[0]}
                <svg
                  className="h-3.5 w-3.5 text-slate-400"
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
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
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
                    onClick={() => setMenuOpen(false)}
                  >
                    Mon espace
                  </Link>
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
            <>
              <Link href="/login" className="text-slate-900">
                Connexion
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Créer mon compte
              </Link>
            </>
          )}
        </nav>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-50 md:hidden"
          aria-label="Menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-100 bg-white px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm font-medium text-slate-600">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {!isAuthenticated && (
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                Connexion
              </Link>
            )}
            {!isAuthenticated && (
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-center font-semibold text-white"
              >
                Créer mon compte
              </Link>
            )}
            {isAuthenticated && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
              >
                Mon espace
              </Link>
            )}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="text-left text-red-600"
              >
                Déconnexion
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
