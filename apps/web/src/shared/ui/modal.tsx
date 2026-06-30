"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  /** Optional leading icon in the header. */
  icon?: ReactNode;
  size?: ModalSize;
  /** Sticky footer (typically the action buttons). */
  footer?: ReactNode;
  children?: ReactNode;
  /** Hide the default close (X) button. */
  hideClose?: boolean;
  /** When false, backdrop click + Escape no longer close (e.g. during submit). */
  dismissable?: boolean;
  /** Extra classes on the scrollable body. */
  contentClassName?: string;
};

/**
 * Modale unique de l'app : overlay + backdrop, fermeture Échap / clic dehors,
 * verrou de scroll, focus, sémantique `role="dialog"`. Remplace les ~20 modales
 * réimplémentées à la main (cohérence + accessibilité).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  footer,
  children,
  hideClose = false,
  dismissable = true,
  contentClassName,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  const hasHeader = Boolean(title) || !hideClose;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismissable ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative z-10 flex max-h-[90vh] w-full ${sizeMap[size]} flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl outline-none`}
      >
        {hasHeader && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="flex items-start gap-3">
              {icon && <div className="shrink-0">{icon}</div>}
              <div>
                {title && (
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1 text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        <div
          className={`flex-1 overflow-y-auto px-5 py-4 ${contentClassName ?? ""}`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
