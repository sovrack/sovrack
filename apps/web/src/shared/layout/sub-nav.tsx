"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

/**
 * Barre de sous-onglets reliant des pages sœurs (ex. Deployments ↔ Pipelines),
 * pour les présenter comme un seul espace « Livraison » sans encombrer la
 * sidebar de plusieurs entrées de 1er niveau qui se chevauchent.
 */
export function SubNav({ tabs }: { tabs: { label: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="border-b border-[var(--border)]">
      <nav className="flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "border-b-2 px-4 py-2.5 text-sm font-medium transition",
                active
                  ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
