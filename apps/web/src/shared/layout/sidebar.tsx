"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/features/auth/api/use-auth";
import { useSidebar } from "@/shared/contexts/sidebar-context";
import { useI18n } from "@/shared/i18n/language-context";
import { SovrackLogo } from "@/shared/ui/sovrack-logo";
import { APP_NAV_SECTIONS, isRouteActive } from "@/shared/config/navigation";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { customerAppPath } from "@/shared/config/product-urls";

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
        "group flex items-center gap-2.5 rounded-lg py-2 text-[14.5px] transition-colors duration-150",
        collapsed ? "px-2.5 lg:justify-center lg:px-0" : "px-3",
        isActive
          ? "bg-[#202025] font-medium text-white shadow-sm"
          : "font-normal text-zinc-400 hover:bg-white/5 hover:text-white",
      )}
    >
      <Icon
        className={clsx(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          isActive
            ? "text-[#2563EB]"
            : "text-zinc-500 group-hover:text-zinc-300",
        )}
      />
      <span className={clsx("truncate tracking-[-0.01em]", collapsed && "lg:hidden")}>
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
        "mb-1.5 mt-4 px-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400",
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
          "fixed left-0 top-0 z-50 flex h-screen w-[230px] flex-col border-r border-zinc-800/40 bg-[#121212] transition-all duration-300 ease-in-out lg:z-40",
          collapsed ? "lg:w-16" : "lg:w-[230px]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div
          className={clsx("shrink-0 py-3.5", collapsed ? "px-2.5 lg:px-2" : "px-3.5")}
        >
          <Link
            href={customerAppPath("/dashboard")}
            onClick={closeMobileSidebar}
            className={clsx(
              "flex w-full items-center gap-2.5",
              collapsed && "lg:justify-center",
            )}
          >
            <SovrackLogo className="w-8 h-8 text-white shrink-0" width={32} height={32} />
            <span
              className={clsx(
                "truncate text-[23px] font-bold tracking-tight text-white antialiased",
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
