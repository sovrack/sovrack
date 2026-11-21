"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/features/auth/api/use-auth";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useI18n } from "@/shared/i18n/language-context";
import { LogOut, Settings } from "lucide-react";
import { SovrackLogo } from "@/shared/ui/sovrack-logo";
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
        "group flex items-center gap-3 rounded-lg py-2 text-[13.5px] transition-colors duration-150",
        collapsed ? "px-3 lg:justify-center lg:px-0" : "px-3",
        isActive
          ? "bg-[#2563EB]/15 font-medium text-white"
          : "font-normal text-zinc-400 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon
        className={clsx(
          "h-4 w-4 shrink-0 transition-colors",
          isActive
            ? "text-[#2563EB]"
            : "text-zinc-500 group-hover:text-zinc-200",
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
        "mb-1.5 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500",
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
  const { isAdmin } = useAuth();
  const { collapsed, isMobileOpen, closeMobileSidebar } = useSidebar();

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
          "fixed left-0 top-0 z-50 flex h-screen w-56 flex-col bg-[#0a0a0a] transition-all duration-300 ease-in-out lg:z-40",
          collapsed ? "lg:w-20" : "lg:w-56",
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
              "flex w-full items-center gap-2.5",
              collapsed && "lg:justify-center",
            )}
          >
            <SovrackLogo className="w-6 h-6 text-white shrink-0" width={24} height={24} />
            <span
              className={clsx(
                "truncate text-[18px] font-bold tracking-tight text-white antialiased",
                collapsed && "lg:hidden",
              )}
            >
              sovrack
            </span>
          </Link>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-2 pb-6 no-scrollbar">
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
      </aside>
    </>
  );
}
