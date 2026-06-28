'use client';

import { useCallback, useState } from 'react';

export type ToastTone = 'success' | 'error';
export type ToastItem = { id: number; message: string; tone: ToastTone };

/**
 * État + push de notifications éphémères (auto-dismiss). Factorise la logique
 * dupliquée dans plusieurs pages (admin/users, settings/registry, settings/git).
 * Le RENDU reste à la charge de chaque page (positions/styles différents).
 */
export function useToasts(autoDismissMs = 3000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (message: string, tone: ToastTone) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, autoDismissMs);
    },
    [autoDismissMs],
  );

  const dismiss = useCallback(
    (id: number) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    [],
  );

  return { toasts, showToast, dismiss };
}
