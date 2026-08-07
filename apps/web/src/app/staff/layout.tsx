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
  Rocket,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useStaffAuth } from "@/features/staff/api/use-staff-auth";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/staff", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/staff/users", label: "Utilisateurs", icon: Users },
  { href: "/staff/staff", label: "Équipe back-office", icon: ShieldCheck },
  { href: "/staff/teams", label: "Équipes", icon: Rocket },
  { href: "/staff/subscriptions", label: "Abonnements", icon: CreditCard },
  { href: "/staff/audit-logs", label: "Journal d'audit", icon: ClipboardList },
  { href: "/staff/systems", label: "Systèmes", icon: Activity },
];

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { staff, logout, fetchMe } = useStaffAuth();

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  if (pathname === "/staff/login") {
    return <>{children}</>;
  }

  if (!staff) {
    router.replace("/staff/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-zinc-950">
          <div className="flex items-center gap-2 px-5 py-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/30">
              <ShieldCheck size={18} className="text-white" />
            </span>
            <div>
              <p className="text-sm font-bold text-white">Sovrack</p>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                Back-office
              </p>
            </div>
          </div>

          <nav className="flex-1 space-y-0.5 px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/staff" &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
            })}
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
                <p className="truncate text-[11px] text-zinc-400">{staff.email}</p>
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
              href="/"
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition hover:bg-white/5 hover:text-white"
            >
              <Activity size={16} />
              Retour au site
            </Link>
          </div>
        </aside>

        <main className="min-h-screen flex-1 bg-zinc-950 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}