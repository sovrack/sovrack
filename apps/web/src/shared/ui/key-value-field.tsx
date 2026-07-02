import type { ReactNode } from "react";

type KeyValueFieldProps = {
  k: string;
  v: string;
  mono?: boolean;
  icon?: ReactNode;
};

export function KeyValueField({ k, v, mono, icon }: KeyValueFieldProps) {
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
