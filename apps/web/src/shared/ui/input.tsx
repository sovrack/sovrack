import clsx from "clsx";
import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Input({
  label,
  hint,
  error,
  leftIcon,
  rightIcon,
  className,
  id,
  ...rest
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            {leftIcon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          className={clsx(
            "w-full rounded-md border border-border bg-card py-2.5 text-sm text-primary outline-none transition",
            "placeholder:text-muted",
            "focus:border-border-hover focus:outline-none focus:ring-1 focus:ring-accent/30",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-red-500/40 focus:ring-red-500/40" : "",
            leftIcon ? "pl-9" : "pl-3.5",
            rightIcon ? "pr-9" : "pr-3.5",
            className,
          )}
        />
        {rightIcon && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      {hint && !error && (
        <p className="mt-1.5 text-xs text-secondary">{hint}</p>
      )}
    </div>
  );
}
