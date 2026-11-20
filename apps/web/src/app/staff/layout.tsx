"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Activity,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  LockKeyhole,
  Menu,
  Rocket,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { SovrackLogo } from "@/components/marketing/sovrack-logo";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { PlatformRole } from "@/features/staff/types/staff";
import { publicSitePath } from "@/shared/config/product-urls";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: PlatformRole[];
}> = [
  {
    href: "/staff",
    label: "Vue d'ensemble",
    icon: LayoutDashboard,
    roles: ["ROOT", "ADMIN", "OPERATOR"],
  },
  {
    href: "/staff/users",
    label: "Utilisateurs",
    icon: Users,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/staff",
    label: "Équipe back-office",
    icon: ShieldCheck,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/teams",
    label: "Workspaces",
    icon: Rocket,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/settings/security",
    label: "Sécurité du compte",
    icon: LockKeyhole,
    roles: ["ROOT", "ADMIN", "OPERATOR"],
  },
  {
    href: "/staff/subscriptions",
    label: "Abonnements",
    icon: CreditCard,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/settings/email",
    label: "Configuration email",
    icon: Mail,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/audit-logs",
    label: "Journal d'audit",
    icon: ClipboardList,
    roles: ["ROOT", "ADMIN"],
  },
  {
    href: "/staff/systems",
    label: "Systèmes",
    icon: Activity,
    roles: ["ROOT", "ADMIN", "OPERATOR"],
  },
];

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPublicStaffPath = [
    "/staff/login",
    "/staff/activate",
    "/staff/forgot-password",
    "/staff/reset-password",
  ].includes(pathname);
  const router = useRouter();
  const { staff, loading, initialized, logout, fetchMe } = useStaffAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isPublicStaffPath) {
      void fetchMe();
    }
  }, [fetchMe, isPublicStaffPath]);

  useEffect(() => {
    if (!isPublicStaffPath && initialized && !loading && !staff) {
      router.replace("/staff/login");
    }
  }, [initialized, isPublicStaffPath, loading, router, staff]);

  useEffect(() => {
    if (!staff || isPublicStaffPath) return;
    const route = NAV_ITEMS.find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/staff" && pathname.startsWith(`${item.href}/`)),
    );
    if (route && !route.roles.includes(staff.role)) {
      router.replace("/staff");
    }
  }, [isPublicStaffPath, pathname, router, staff]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (isPublicStaffPath) {
    return <>{children}</>;
  }

  if (!initialized || loading || !staff) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="flex">
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Fermer la navigation du back-office"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          />
        )}
        <aside
          aria-label="Navigation du back-office"
          className={clsx(
            "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-zinc-950 transition-transform lg:sticky lg:top-0 lg:z-auto lg:translate-x-0",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center gap-2 px-5 py-5">
            <Link
              href="/staff"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Accueil du back-office Sovrack"
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <SovrackLogo className="w-8 h-8 text-white shrink-0" />
              <div>
                <p className="text-[17px] font-bold tracking-[-0.03em] text-white">Sovrack</p>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                  Back-office
                </p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Fermer la navigation"
              onClick={(event) => {
                event.preventDefault();
                setMobileNavOpen(false);
              }}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-4">
            {NAV_ITEMS.filter((item) => item.roles.includes(staff.role)).map(
              (item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/staff" &&
                    pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-white text-zinc-950"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <item.icon size={17} />
                    {item.label}
                  </Link>
                );
              },
            )}
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {staff.fullName?.charAt(0).toUpperCase() || "S"}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {staff.fullName}
                </p>
                <p className="truncate text-[11px] text-zinc-400">
                  {staff.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/staff/login");
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              <LogOut size={16} />
              Déconnexion
            </button>
            <Link
              href={publicSitePath("/")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-white/5 hover:text-white"
            >
              <Activity size={16} />
              Retour au site
            </Link>
          </div>
        </aside>

        <main className="min-h-screen min-w-0 flex-1 bg-zinc-950 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Ouvrir la navigation du back-office"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              <Menu size={19} />
            </button>
            <div>
              <p className="text-sm font-bold text-white">Sovrack</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Back-office
              </p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
