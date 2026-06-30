import type { ReactNode } from "react";

type FieldProps = {
  k: string;
  v: string;
  mono?: boolean;
  icon?: ReactNode;
};

export function Field({ k, v, mono, icon }: FieldProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {k}
      </dt>
      <dd
        className={`mt-0.5 flex items-center gap-1 truncate text-[var(--text-primary)] ${mono ? "font-mono text-xs" : "text-sm"}`}
      >
        {icon}
        {v}
      </dd>
    </div>
  );
}
