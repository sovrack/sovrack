"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ToastTone = "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastFn = (message: string, tone: ToastTone) => void;

const ToastContext = createContext<ToastFn | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * F-7/F-13 fix: Global imperative toast system rendered once at the app root.
 * Replaces the per-page useState+notice pattern with a single shared context.
 *
 *   const toast = useToast();
 *   toast('Service saved', 'success');
 *   toast('Failed to delete', 'error');
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback<ToastFn>((message, tone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}

      {/* Portal-like fixed overlay — rendered once, always on top */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className={[
              "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm max-w-sm w-full backdrop-blur-sm",
              toast.tone === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300",
            ].join(" ")}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : (
              <XCircle size={16} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
