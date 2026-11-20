"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/api/use-auth";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useI18n } from "@/shared/i18n/language-context";
import { deploymentsService } from "@/features/deployments/api/deployments.service";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  User,
  XCircle,
  Loader2,
  Rocket,
  Globe2,
} from "lucide-react";
import { publicSitePath } from "@/shared/config/product-urls";
import clsx from "clsx";
import type { Deployment } from "@/features/deployments/types";
import { timeAgoCompact } from "@/shared/lib/format-date";
import { WorkspaceSwitcher } from "@/features/teams/components/workspace-switcher";
import {
  deploymentStatusLabel,
  workspaceRoleLabel,
} from "@/shared/i18n/product-labels";

/* ─── Notification bell ─────────────────────────────────────────────────── */

function statusIcon(status: Deployment["status"]) {
  if (status === "SUCCESS")
    return <CheckCircle2 size={13} className="shrink-0 text-green-400" />;
  if (status === "FAILED" || status === "CANCELED")
    return <XCircle size={13} className="shrink-0 text-red-400" />;
  return <Loader2 size={13} className="shrink-0 animate-spin text-accent" />;
}

function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>(() => {
    if (typeof window !== "undefined")
      return (
        localStorage.getItem("notif_last_seen") ?? new Date(0).toISOString()
      );
    return new Date(0).toISOString();
  });
  const ref = useRef<HTMLDivElement>(null);

  const { data: deployments = [], refetch } = useQuery({
    queryKey: ["notif-deployments"],
    queryFn: () => deploymentsService.getAll(),
    // LOT4c : fin du polling permanent (chaque utilisateur interrogeait TOUS
    // les déploiements toutes les 30s). Rafraîchi au focus de l'onglet et à
    // l'ouverture de la cloche — les événements temps réel passent déjà par
    // les WebSockets des pages concernées.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    select: (list) =>
      list
        .filter((d) =>
          ["SUCCESS", "FAILED", "CANCELED", "RUNNING"].includes(d.status),
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 8),
  });

  const unseen = deployments.filter(
    (d) => new Date(d.createdAt) > new Date(lastSeen),
  );
  const hasUnread = unseen.length > 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = () => {
    if (!open) void refetch();
    setOpen((v) => !v);
    if (!open) {
      const now = new Date().toISOString();
      setLastSeen(now);
      localStorage.setItem("notif_last_seen", now);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition hover:bg-hover/10 hover:text-primary"
        title="Notifications"
      >
        <Bell size={17} />
        {hasUnread && (
          <span className="absolute right-2 top-2 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 ring-2 ring-app" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-card shadow-theme-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-primary">
              {t("Recent activity")}
            </span>
            <Link
              href="/settings/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted transition hover:text-secondary"
            >
              <Settings size={10} /> {t("Configure")}
            </Link>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {deployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <Rocket size={20} className="mb-2 text-muted" />
                <p className="text-xs text-secondary">
                  {t("No recent activity")}
                </p>
              </div>
            ) : (
              deployments.map((dep) => {
                const isNew = new Date(dep.createdAt) > new Date(lastSeen);
                return (
                  <Link
                    key={dep.id}
                    href={`/deployments?logs=${dep.id}`}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-start gap-3 px-4 py-3 text-left transition hover:bg-hover/10",
                      isNew && "bg-accent/5",
                    )}
                  >
                    <div className="mt-0.5">{statusIcon(dep.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary">
                        {dep.project.name}
                        {isNew && (
                          <span className="ml-2 rounded-md bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                            {t("New")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {dep.environment.name} · {dep.branch} ·{" "}
                        {deploymentStatusLabel(dep.status)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted">
                      {timeAgoCompact(dep.createdAt)}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/deployments"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-secondary transition hover:text-primary"
            >
              {t("View all deployments →")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Top nav ───────────────────────────────────────────────────────────── */

export function TopNav() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, logout, workspaceRole } = useAuth();
  const { toggleSidebar, toggleMobileSidebar } = useSidebar();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const handleLogout = () => {
    setDropdownOpen(false);
    logout();
    router.push("/login");
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-app/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={toggleMobileSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition hover:bg-hover/10 hover:text-primary lg:hidden"
          title="Ouvrir la navigation"
          aria-label="Ouvrir la navigation"
        >
          <Menu size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-secondary transition hover:bg-hover/10 hover:text-primary lg:flex"
          title="Réduire ou agrandir la navigation"
          aria-label="Réduire ou agrandir la navigation"
        >
          <Menu size={18} strokeWidth={2} />
        </button>

        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <WorkspaceSwitcher />
          <Link
            href={publicSitePath("/")}
            target="_blank"
            rel="noopener noreferrer"
            title="Ouvrir le site public"
            aria-label="Ouvrir le site public dans un nouvel onglet"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-secondary transition hover:bg-hover/10 hover:text-primary min-[400px]:flex"
          >
            <Globe2 size={17} />
          </Link>
          <NotificationBell />

          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm transition hover:bg-hover/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
                {initials}
              </div>
              <div className="hidden text-left md:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-primary">
                  {user?.fullName ?? "Utilisateur"}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
                  {workspaceRoleLabel(workspaceRole)}
                </p>
              </div>
              <ChevronDown
                size={14}
                className="hidden text-muted md:block"
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-card p-2 shadow-theme-lg z-50">
                <div className="rounded-lg bg-hover/10 px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-primary">
                    {user?.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-secondary">
                    {user?.email}
                  </p>
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <Link
                    href={publicSitePath("/")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-secondary transition hover:bg-hover/10 hover:text-primary"
                  >
                    <Globe2 size={14} className="text-muted" />
                    Site public
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push("/settings/account");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-secondary transition hover:bg-hover/10 hover:text-primary"
                  >
                    <User size={14} className="text-muted" />
                    {t("Settings")}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-400"
                  >
                    <LogOut size={14} className="text-red-400" />
                    {t("Log out")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
