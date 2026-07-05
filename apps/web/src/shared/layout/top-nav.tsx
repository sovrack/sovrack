"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/api/use-auth";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useI18n } from "@/shared/i18n/language-context";
import { ThemeToggle } from "@/shared/common/theme-toggle";
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
} from "lucide-react";
import clsx from "clsx";
import type { Deployment } from "@/features/deployments/types";
import { timeAgoCompact } from "@/shared/lib/format-date";

/* ─── Notification bell ─────────────────────────────────────────────────── */

function statusIcon(status: Deployment["status"]) {
  if (status === "SUCCESS")
    return <CheckCircle2 size={13} className="shrink-0 text-green-400" />;
  if (status === "FAILED" || status === "CANCELED")
    return <XCircle size={13} className="shrink-0 text-red-400" />;
  return <Loader2 size={13} className="shrink-0 animate-spin text-blue-400" />;
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
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
        title="Notifications"
      >
        <Bell size={17} />
        {hasUnread && (
          <span className="absolute right-2 top-2 flex h-2 w-2 items-center justify-center rounded-full bg-red-500 ring-2 ring-[var(--bg-app)]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {t("Recent activity")}
            </span>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
            >
              <Settings size={10} /> {t("Configure")}
            </Link>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
            {deployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <Rocket size={20} className="mb-2 text-[var(--text-muted)]" />
                <p className="text-xs text-[var(--text-secondary)]">
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
                      "flex items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--hover)]",
                      isNew && "bg-blue-500/5",
                    )}
                  >
                    <div className="mt-0.5">{statusIcon(dep.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {dep.project.name}
                        {isNew && (
                          <span className="ml-2 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-400">
                            {t("New")}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {dep.environment.name} · {dep.branch} · {dep.status}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                      {timeAgoCompact(dep.createdAt)}
                    </span>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] px-4 py-2.5">
            <Link
              href="/deployments"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              {t("View all deployments →")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Language toggle (D1) ──────────────────────────────────────────────── */

function LanguageToggle() {
  const { lang, setLang, mounted } = useI18n();
  if (!mounted) return null;
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "fr" : "en")}
      title={lang === "en" ? "Passer en français" : "Switch to English"}
      aria-label="Toggle language"
      className="flex h-9 items-center justify-center rounded-xl px-2.5 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
    >
      {lang === "en" ? "FR" : "EN"}
    </button>
  );
}

/* ─── Top nav ───────────────────────────────────────────────────────────── */

export function TopNav() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
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
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-app)]/90 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu size={18} strokeWidth={2} />
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <LanguageToggle />
          <ThemeToggle />
          <NotificationBell />

          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1.5 text-sm transition hover:bg-[var(--hover)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--text-primary)] text-[11px] font-bold text-[var(--bg-app)]">
                {initials}
              </div>
              <div className="hidden text-left md:block">
                <p className="max-w-[140px] truncate text-sm font-semibold text-[var(--text-primary)]">
                  {user?.fullName ?? "User"}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {user?.role ?? "DEVELOPER"}
                </p>
              </div>
              <ChevronDown
                size={14}
                className="hidden text-[var(--text-muted)] md:block"
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-2xl z-50">
                <div className="rounded-lg bg-[var(--hover)] px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {user?.fullName}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    {user?.email}
                  </p>
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      router.push("/settings/account");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
                  >
                    <User size={14} className="text-[var(--text-muted)]" />
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
