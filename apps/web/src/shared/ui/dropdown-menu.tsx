"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Menu déroulant unique de l'app (Phase 1.1, mission finale). Rendu dans un
 * PORTAL (`document.body`) en `position: fixed`, positionné à partir du
 * `getBoundingClientRect()` du déclencheur — il échappe ainsi à tout conteneur
 * `overflow-*: auto` (ex. le wrapper scrollable de la table des serveurs, qui
 * rognait l'ancien menu `absolute` et créait une scrollbar parasite).
 * Ferme au clic extérieur, à Échap, et au scroll/resize (position figée).
 *
 * API : `trigger` = le bouton déclencheur (reçoit `open`), `children` = le
 * contenu du menu (reçoit `close` pour fermer après action). Utiliser
 * `DropdownItem` / `DropdownDivider` pour un rendu cohérent.
 */
type DropdownMenuProps = {
  trigger: (state: { open: boolean }) => ReactNode;
  children: (helpers: { close: () => void }) => ReactNode;
  align?: "left" | "right";
  width?: number;
  disabled?: boolean;
  /** aria-label du bouton déclencheur. */
  label?: string;
};

export function DropdownMenu({
  trigger,
  children,
  align = "right",
  width = 208,
  disabled,
  label,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left =
      align === "right"
        ? Math.max(8, rect.right - width)
        : Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 6, left });
  };

  // Position calculée AVANT peinture pour éviter un flash au mauvais endroit.
  useLayoutEffect(() => {
    if (open) computePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !menuRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Le menu est en position fixe figée : au scroll/resize on ferme plutôt
    // que de suivre (comportement standard et sans jank).
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center"
      >
        {trigger({ open })}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, left: coords.left, width }}
            className="fixed z-[100] rounded-lg border border-border bg-card p-1.5 shadow-theme-lg"
          >
            {children({ close })}
          </div>,
          document.body,
        )}
    </>
  );
}

const baseItem =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition";

type DropdownItemProps = {
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  children: ReactNode;
};

/** Élément de menu — bouton, ou lien si `href` (rendu en <a>). */
export function DropdownItem({
  icon,
  onClick,
  href,
  danger,
  children,
}: DropdownItemProps) {
  const cls = `${baseItem} ${
    danger
      ? "text-red-400 hover:bg-red-500/10"
      : "text-secondary hover:bg-hover/10 hover:text-primary"
  }`;
  if (href) {
    return (
      <a role="menuitem" href={href} onClick={onClick} className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 border-t border-border" />;
}
