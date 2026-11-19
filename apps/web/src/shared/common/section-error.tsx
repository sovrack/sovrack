"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Reusable section-level error boundary UI (used by the various `error.tsx`).
 * Turns an uncaught render/runtime error into a contained, retryable panel
 * instead of a blank screen — the rest of the app shell keeps working.
 */
export function SectionError({
  error,
  reset,
  title = "Something went wrong",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  useEffect(() => {
    // Surface to the browser console for debugging; server logs capture it too.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
        <AlertTriangle size={22} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">
        This section ran into an error. Try again — if the problem persists,
        contact an administrator.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-[var(--text-muted)] opacity-60">
          Ref: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
      >
        <RotateCcw size={14} /> Try again
      </button>
    </div>
  );
}
