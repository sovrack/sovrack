"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

/**
 * One read-only credential row: label + value, with an optional reveal (eye)
 * toggle for secret values and a copy-to-clipboard button. Combines the two
 * patterns already used across the product (EnvVariablesPreview's eye toggle +
 * ServiceWebhook's clipboard-with-"copied"-flag) into a single reusable field
 * for the DATABASE Credentials panel (Task 4).
 */
export function CredentialField({
  label,
  value,
  secret = false,
  mono = true,
}: {
  label: string;
  value: string;
  /** Masked behind dots until revealed. */
  secret?: boolean;
  mono?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  const shown = !secret || revealed;
  const display = shown ? value : "•".repeat(Math.min(value.length || 8, 24));

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-primary ${mono ? "font-mono text-xs" : "text-sm"}`}
          title={shown ? value : undefined}
        >
          {display}
        </span>
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? "Hide value" : "Reveal value"}
            className="shrink-0 rounded-md p-1 text-muted transition hover:bg-hover/10 hover:text-primary"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-md p-1 text-muted transition hover:bg-hover/10 hover:text-primary"
        >
          {copied ? (
            <Check size={13} className="text-green-500" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}
