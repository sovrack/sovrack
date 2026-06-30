import type { SourceProviderOption } from "@/features/projects/types/project";
import { KINDS, type ServiceKind } from "./add-service-wizard.catalog";

/* Petits composants de présentation du wizard « Create Service » (extraits pour
   garder add-service-wizard.tsx sous la limite de taille). */

/** Étape 1 : choix du type de service (grille des KINDS). */
export function KindPicker({ onPick }: { onPick: (k: ServiceKind) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {KINDS.map((k) => (
        <button
          key={k.kind}
          type="button"
          onClick={() => onPick(k.kind)}
          disabled={k.disabled}
          title={k.disabled ? k.hint : undefined}
          className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-left transition enabled:hover:border-[var(--text-muted)] enabled:hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">
            {k.icon}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              {k.label}
              {k.badge && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--hover)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  {k.badge}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              {k.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{k}</dt>
      <dd className="truncate font-medium text-[var(--text-primary)]">{v}</dd>
    </div>
  );
}

export function ProviderSelect({
  providers,
  value,
  onChange,
}: {
  providers: SourceProviderOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Provider
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
      >
        {providers.length === 0 ? (
          <option value="">
            No provider configured — add one in Git Providers
          </option>
        ) : null}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.type}
            {p.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
