"use client";

import clsx from "clsx";
import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
};

export function PasswordInput({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type={revealed ? "text" : "password"}
          className={clsx(
            "w-full rounded-md border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none transition",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:ring-1 focus:ring-zinc-400",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-red-500/40 focus:ring-red-500/40" : "",
            "pl-3.5",
            className,
          )}
        />
        <button
          type="button"
          aria-label={
            revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"
          }
          onClick={() => setRevealed((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          {revealed ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{hint}</p>
      )}
    </div>
  );
}
