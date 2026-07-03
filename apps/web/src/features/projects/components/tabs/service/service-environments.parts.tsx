"use client";

import { Plus, X } from "lucide-react";

// Extracted from service-environments.tsx (C7) to stay under the file-size
// gate — these are the KEY=value editing primitives shared by EnvVarsEditor.

export type KV = { key: string; value: string };

export function kvFromRaw(raw: unknown): KV[] {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value: String(value ?? ""),
  }));
}

export function kvToJson(rows: KV[]): string {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) o[k] = r.value;
  }
  return JSON.stringify(o);
}

// C7: .env-format text editor for Variables — KEY=value, one per line.
// Blank lines are silently ignored; a line missing "=" or with an invalid
// key is flagged (highlighted + listed) but does NOT block saving the rest —
// only the well-formed lines are kept.
const ENV_LINE_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function kvToEnvText(rows: KV[]): string {
  return rows.map((r) => `${r.key}=${r.value}`).join("\n");
}

export function parseEnvText(text: string): {
  valid: KV[];
  invalidLines: number[];
} {
  const valid: KV[] = [];
  const invalidLines: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const eqIdx = line.indexOf("=");
    const key = eqIdx > 0 ? line.slice(0, eqIdx).trim() : "";
    if (eqIdx <= 0 || !ENV_LINE_KEY_RE.test(key)) {
      invalidLines.push(i);
      return;
    }
    valid.push({ key, value: line.slice(eqIdx + 1) });
  });
  return { valid, invalidLines };
}

/**
 * .env-format textarea (C7) — replaces the previous row-by-row KEY + value
 * inputs for non-secret Variables. Malformed lines are highlighted in place
 * (via a synced background overlay) and listed below, but don't block saving
 * the well-formed lines — see VERIFICATION_ORGANISATION_FINALE.md discussion.
 *
 * Deliberately NOT used for Secrets: a shared textarea can't mask individual
 * lines the way the row-based editor's per-row `type="password"` does, and
 * secrets typed in cleartext into a big textarea is a real regression
 * (visible on screen/in recordings) — Secrets keeps the row editor below.
 */
export function EnvTextEditor({
  text,
  setText,
}: {
  text: string;
  setText: (t: string) => void;
}) {
  const lines = text.split("\n");
  const { invalidLines } = parseEnvText(text);
  const invalidSet = new Set(invalidLines);

  return (
    <div>
      <div className="relative font-mono text-xs leading-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={
                invalidSet.has(i) ? "bg-red-500/10" : "bg-transparent"
              }
              style={{ height: "1.25rem" }}
            />
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.max(4, lines.length)}
          spellCheck={false}
          placeholder={"NAME=value\nANOTHER_NAME=another value"}
          className="relative w-full resize-y rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 font-mono text-xs leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)]"
        />
      </div>
      {invalidLines.length > 0 && (
        <p className="mt-1 text-[10px] text-red-400">
          Line{invalidLines.length > 1 ? "s" : ""}{" "}
          {invalidLines.map((i) => i + 1).join(", ")}{" "}
          {invalidLines.length > 1 ? "don't" : "doesn't"} match{" "}
          <span className="font-mono">NAME=value</span> — ignored on save.
        </p>
      )}
    </div>
  );
}

/** Lignes KEY=value (ajouter/supprimer). `secret` masque les valeurs. */
export function KvRows({
  rows,
  setRows,
  secret,
}: {
  rows: KV[];
  setRows: (r: KV[]) => void;
  secret?: boolean;
}) {
  const inputCls =
    "rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]";
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={r.key}
            onChange={(e) =>
              setRows(
                rows.map((x, j) =>
                  j === i ? { ...x, key: e.target.value } : x,
                ),
              )
            }
            placeholder="KEY"
            className={`${inputCls} w-1/3`}
          />
          <span className="text-[var(--text-muted)]">=</span>
          <input
            value={r.value}
            type={secret ? "password" : "text"}
            onChange={(e) =>
              setRows(
                rows.map((x, j) =>
                  j === i ? { ...x, value: e.target.value } : x,
                ),
              )
            }
            placeholder="value"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-red-400"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { key: "", value: "" }])}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        <Plus size={11} /> Add a variable
      </button>
    </div>
  );
}

// C6: the 4 build packs actually offered by the deploy engine — mirrors
// ServiceConfigForm's BUILD_PACKS list exactly (BUILDPACK/DOCKER_COMPOSE are
// deliberately excluded there — not implemented / single-container engine —
// so the per-environment override must not offer them either).
export const BUILD_PACKS = ["DOCKERFILE", "NIXPACKS", "STATIC", "NONE"] as const;

export type ServiceDefaults = {
  branch: string | null;
  port: number | null;
  startCommand: string | null;
  healthcheckPath: string | null;
  buildPack: string | null;
};
