"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]";

// Build-time variables are edited as ordered rows (a Record can't hold a
// half-typed duplicate key while editing) and collapsed back to a map on save,
// dropping rows with an empty key.
export type BuildArgRow = { key: string; value: string };

// Valid shell/Docker --build-arg identifier: letters, digits, underscore, not
// starting with a digit. A malformed key isn't a security issue (it's quoted
// safely on the way to the build command either way) — this is purely to catch
// typos before they surface as a confusing build failure instead of a form hint.
const VALID_BUILD_ARG_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function rowsToRecord(rows: BuildArgRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of rows) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

/**
 * Monorepo root-directory field, split out of ServiceConfigForm to stay under
 * the file-size gate. Empty = build from the repo root.
 */
export function RootDirField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <label
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
        htmlFor="svc-rootdir"
      >
        Root directory (monorepo)
      </label>
      <input
        id="svc-rootdir"
        className={`${inputClass} font-mono`}
        value={value}
        placeholder="apps/web — leave empty to build from the repo root"
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Build only this subfolder of the repo (e.g. a Next.js app in a
        monorepo). Empty = repo root.
      </p>
    </div>
  );
}

/**
 * Registry-mode image + tag fields, split out of ServiceConfigForm to stay
 * under the file-size gate. Shown only when Build mode = Registry.
 */
export function RegistryImageFields({
  image,
  setImage,
  tag,
  setTag,
}: {
  image: string;
  setImage: (v: string) => void;
  tag: string;
  setTag: (v: string) => void;
}) {
  return (
    <>
      <div>
        <label
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
          htmlFor="svc-regimage"
        >
          Image registre
        </label>
        <input
          id="svc-regimage"
          className={`${inputClass} font-mono`}
          value={image}
          placeholder="registry.gitlab.com/grp/app"
          onChange={(e) => setImage(e.target.value)}
        />
      </div>
      <div>
        <label
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
          htmlFor="svc-regtag"
        >
          Tag
        </label>
        <input
          id="svc-regtag"
          className={`${inputClass} font-mono`}
          value={tag}
          placeholder="latest"
          onChange={(e) => setTag(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
        In{" "}
        <span className="font-semibold text-[var(--text-secondary)]">
          Registry
        </span>{" "}
        mode, the image is pulled from the registry at deploy time. Leave empty
        to <span className="font-semibold">derive it automatically</span> from
        CI; set it to pin a specific image. Registry credentials live in{" "}
        <span className="font-semibold">Settings → Registry</span>.
      </div>
    </>
  );
}

/**
 * Key-value editor for build-time variables (NEXT_PUBLIC_*, VITE_*), split out
 * of ServiceConfigForm to stay under the file-size gate. These are frozen into
 * the image via --build-arg — public, never secrets — and ignored in Registry
 * mode (the CI builds the image).
 */
export function BuildArgsEditor({
  rows,
  onChange,
  isRegistryMode,
}: {
  rows: BuildArgRow[];
  onChange: (rows: BuildArgRow[]) => void;
  isRegistryMode: boolean;
}) {
  const update = (i: number, field: keyof BuildArgRow, val: string) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  const add = () => onChange([...rows, { key: "", value: "" }]);
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="sm:col-span-2">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Build-time variables
      </span>
      <p className="mb-2 text-xs text-[var(--text-muted)]">
        Frozen into the image at build time (e.g.{" "}
        <span className="font-mono">NEXT_PUBLIC_*</span>,{" "}
        <span className="font-mono">VITE_*</span>). They are{" "}
        <span className="font-semibold">public</span> — visible in the image, so
        never put secrets here (use runtime variables for those).
        {isRegistryMode && (
          <span className="mt-1 block text-[var(--warn,#93691f)]">
            Ignored in Registry mode — your CI builds the image, so it must
            inject these itself.
          </span>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const keyInvalid =
            row.key.trim().length > 0 && !VALID_BUILD_ARG_KEY.test(row.key.trim());
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} font-mono ${keyInvalid ? "border-red-500/50" : ""}`}
                  value={row.key}
                  placeholder="NEXT_PUBLIC_API_URL"
                  onChange={(e) => update(i, "key", e.target.value)}
                />
                <input
                  className={`${inputClass} font-mono`}
                  value={row.value}
                  placeholder="https://api.ton-domaine.com"
                  onChange={(e) => update(i, "value", e.target.value)}
                />
                <button
                  type="button"
                  aria-label="Remove variable"
                  onClick={() => remove(i)}
                  className="shrink-0 rounded-lg border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {keyInvalid && (
                <p className="text-xs text-red-400">
                  Must be letters, digits, underscore only — can&apos;t start
                  with a digit (e.g. NEXT_PUBLIC_API_URL).
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={add}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--hover)]"
        >
          <Plus size={14} /> Add variable
        </button>
      </div>
    </div>
  );
}

type AutoDeployControlProps = {
  environmentId: string;
  autoDeploy: boolean;
  setAutoDeploy: (v: boolean) => void;
  autoBranch: string;
  setAutoBranch: (v: string) => void;
  disabled: boolean;
  isBusy: boolean;
};

/**
 * "Auto-deploy on push" — split out of ServiceConfigForm to stay under the
 * file-size gate. Moved here from the old Variables tab (Task 1, "Correction
 * rapide" mission), placed next to Deployment trigger — see
 * service-config-form.tsx's doc comment for why this is a DISTINCT setting
 * from Deployment trigger, not a duplicate.
 */
export function AutoDeployControl({
  environmentId,
  autoDeploy,
  setAutoDeploy,
  autoBranch,
  setAutoBranch,
  disabled,
  isBusy,
}: AutoDeployControlProps) {
  if (!environmentId) {
    return (
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Select an environment above to configure.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2">
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={autoDeploy}
          disabled={disabled}
          onChange={(e) => setAutoDeploy(e.target.checked)}
        />
        Enabled
      </label>
      <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        branch
        <input
          value={autoBranch}
          onChange={(e) => setAutoBranch(e.target.value)}
          placeholder="main"
          disabled={!autoDeploy || disabled}
          className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] outline-none disabled:opacity-50"
        />
      </span>
      {isBusy && (
        <Loader2
          size={13}
          className="animate-spin text-[var(--text-muted)]"
        />
      )}
    </div>
  );
}
