import type { ReactNode } from "react";

/**
 * Shared form-field wrapper (label + optional hint/error + children).
 * Generalized from two near-identical local implementations:
 * features/source-providers/components/provider-form-fields.tsx and
 * features/projects/components/project-setup-wizard.tsx.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          {label}
          {required && <span className="text-red-400">*</span>}
        </span>
        {children}
      </label>
      {error ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : (
        hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      )}
    </div>
  );
}
