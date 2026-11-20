"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/features/auth/api/use-auth";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useI18n } from "@/shared/i18n/language-context";
import { LogOut, Settings } from "lucide-react";
import { SovrackLogo } from "@/components/marketing/sovrack-logo";
import { APP_NAV_SECTIONS, isRouteActive } from "@/shared/config/navigation";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath } from "@/shared/config/product-urls";
import { workspaceRoleLabel } from "@/shared/i18n/product-labels";

type NavItemProps = {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  collapsed: boolean;
  onNavigate: () => void;
};

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
  onNavigate,
}: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={clsx(
        "group flex items-center gap-3 rounded-md py-2 text-[15px] transition-colors duration-150",
        collapsed ? "px-3 lg:justify-center lg:px-0" : "px-3",
        isActive
          ? "bg-[var(--sidebar-active-bg)] font-medium text-[var(--sidebar-text-active)]"
          : "font-normal text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]",
      )}
    >
      <Icon
        className={clsx(
          "h-5 w-5 shrink-0 transition-colors",
          isActive
            ? "text-[var(--sidebar-text-active)]"
            : "text-[var(--sidebar-icon)] group-hover:text-[var(--sidebar-text-active)]",
        )}
      />
      <span className={clsx("truncate", collapsed && "lg:hidden")}>
        {label}
      </span>
    </Link>
  );
}

function SectionLabel({
  label,
  collapsed,
}: {
  label: string;
  collapsed: boolean;
}) {
  return (
    <p
      className={clsx(
        "mb-1 mt-5 px-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--sidebar-text-muted)]",
        collapsed && "lg:hidden",
      )}
    >
      {label}
    </p>
  );
}

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user, isAdmin, workspaceRole, logout } = useAuth();
  const { collapsed, isMobileOpen, closeMobileSidebar } = useSidebar();

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Fermer la navigation"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        aria-label="Navigation principale"
        className={clsx(
          "fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)] transition-all duration-300 ease-in-out lg:z-40",
          collapsed ? "lg:w-20" : "lg:w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div
          className={clsx("shrink-0 py-4", collapsed ? "px-3 lg:px-2" : "px-3")}
        >
          <Link
            href={customerAppPath("/dashboard")}
            onClick={closeMobileSidebar}
            className={clsx(
              "flex w-full items-center gap-2",
              collapsed && "lg:justify-center",
            )}
          >
            <SovrackLogo className="w-7 h-7 text-white shrink-0" />
            <span
              className={clsx(
                "truncate text-[18px] font-semibold tracking-[-0.02em] text-white antialiased",
                collapsed && "lg:hidden",
              )}
            >
              Sovrack
            </span>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 no-scrollbar">
          {APP_NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) => {
              const allowedForRole = item.adminOnly ? isAdmin : true;
              const capabilityEnabled = item.capability
                ? isCapabilityEnabled(item.capability)
                : true;
              return allowedForRole && capabilityEnabled;
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.id}>
                <SectionLabel label={t(section.label)} collapsed={collapsed} />
                <nav className="space-y-0.5">
                  {visibleItems.map((item) => {
                    return (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        label={t(item.label)}
                        icon={item.icon}
                        isActive={isRouteActive(pathname, item.href)}
                        collapsed={collapsed}
                        onNavigate={closeMobileSidebar}
                      />
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* User card — click to go to platform settings */}
        <div className="shrink-0 border-t border-[var(--border)] p-3">
          <div
            className={clsx(
              "flex items-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] transition hover:bg-[var(--sidebar-hover-bg)]",
              collapsed
                ? "gap-3 px-3 py-2.5 lg:justify-center lg:gap-0 lg:px-0"
                : "gap-3 px-3 py-2.5",
            )}
          >
            <Link
              href="/settings/account"
              onClick={closeMobileSidebar}
              title={collapsed ? "Réglages de la plateforme" : undefined}
              className={clsx(
                "flex items-center gap-3 min-w-0 flex-1",
                collapsed && "lg:justify-center",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-[11px] font-bold text-[var(--bg-app)]">
                {initials}
              </div>
              <div className={clsx("min-w-0 flex-1", collapsed && "lg:hidden")}>
                <p className="truncate text-[15px] font-medium text-[var(--sidebar-text)]">
                  {user?.fullName ?? "Utilisateur"}
                </p>
                <p className="truncate text-[12px] text-[var(--sidebar-text-muted)]">
                  {workspaceRoleLabel(workspaceRole)}
                </p>
              </div>
            </Link>

            <div
              className={clsx(
                "flex shrink-0 items-center gap-1",
                collapsed && "lg:hidden",
              )}
            >
              <Link
                href="/settings/account"
                title="Réglages de la plateforme"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sidebar-text-muted)] transition hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]"
              >
                <Settings size={14} />
              </Link>
              <button
                type="button"
                onClick={logout}
                title="Se déconnecter"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sidebar-text-muted)] transition hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
