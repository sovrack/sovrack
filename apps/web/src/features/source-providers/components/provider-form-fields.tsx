"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Key,
  Shield,
} from "lucide-react";

/* ─── Step indicator ────────────────────────────────────────────────────── */

export function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-0">
      {Array.from({ length: total }).map((_, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <div key={num} className="flex items-center">
            <div
              className={clsx(
                "flex h-7 w-7 items-center justify-center rounded-md border text-xs font-bold transition-all",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : done
                    ? "border-green-500/40 bg-green-500/10 text-green-400"
                    : "border-border text-muted",
              )}
            >
              {done ? <Check size={12} /> : num}
            </div>
            {i < total - 1 && (
              <div
                className={clsx(
                  "mx-1 h-px w-8 transition-all",
                  done ? "bg-green-500/40" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  readOnly,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      className={clsx(
        "w-full rounded-lg border border-border bg-app px-3 py-2.5 text-sm text-primary outline-none placeholder:text-muted transition focus:border-secondary focus:ring-2 focus:ring-secondary/10 disabled:opacity-60",
        className,
      )}
    />
  );
}

export function SecretInput({
  value,
  onChange,
  placeholder,
  alreadySet,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  alreadySet?: boolean;
  label: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          alreadySet
            ? `${label} already set — leave blank to keep`
            : (placeholder ?? "")
        }
        className="w-full rounded-lg border border-border bg-app px-3 py-2.5 pr-10 text-sm text-primary outline-none placeholder:text-muted transition focus:border-secondary focus:ring-2 focus:ring-secondary/10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

export function Toggle({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-app px-3 py-3 text-left transition hover:bg-hover/10"
    >
      <div>
        <p className="text-sm font-medium text-primary">
          {label}
        </p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        )}
      </div>
      <div
        className={clsx(
          "relative h-5 w-9 shrink-0 rounded-md border transition-all",
          value
            ? "border-green-500/50 bg-green-500/20"
            : "border-border bg-hover/10",
        )}
      >
        <div
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-md border transition-all",
            value
              ? "left-4 border-green-400 bg-green-400"
              : "left-0.5 border-border bg-muted",
          )}
        />
      </div>
    </button>
  );
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-secondary transition hover:text-primary"
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Auth method selector ───────────────────────────────────────────────── */

export type AuthChoice = "oauth" | "pat" | "both";

export function AuthMethodCard({
  choice,
  selected,
  onSelect,
  disabled,
  disabledReason,
  providerLabel = "GitLab",
}: {
  choice: AuthChoice;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
  providerLabel?: "GitLab" | "GitHub";
}) {
  const map: Record<
    AuthChoice,
    { icon: React.ReactNode; title: string; desc: string }
  > = {
    oauth: {
      icon: <Shield size={18} className="text-accent" />,
      title: "OAuth",
      desc: `Autorisez l’accès avec une application OAuth ${providerLabel}.`,
    },
    pat: {
      icon: <Key size={18} className="text-amber-400" />,
      title: "Jeton d’accès personnel",
      desc:
        providerLabel === "GitHub"
          ? "Utilisez un jeton GitHub limité aux dépôts et permissions nécessaires à Sovrack."
          : "Utilisez un PAT GitLab avec les permissions api, read_repository et write_repository.",
    },
    both: {
      icon: (
        <span className="flex items-center gap-1">
          <Shield size={15} className="text-accent" />
          <Key size={15} className="text-amber-400" />
        </span>
      ),
      title: "Les deux",
      desc: "Configurez OAuth et un PAT pour les opérations automatisées.",
    },
  };
  const item = map[choice];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={clsx(
        "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition",
        disabled
          ? "cursor-not-allowed border-border opacity-50"
          : selected
            ? "border-accent bg-hover/10"
            : "border-border hover:border-secondary hover:bg-hover/10",
      )}
    >
      <div className="mt-0.5 shrink-0">{item.icon}</div>
      <div>
        <p className="text-sm font-semibold text-primary">
          {item.title}
          {disabled && (
            <span className="ml-2 rounded bg-hover/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
              Bientôt
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {disabled && disabledReason ? disabledReason : item.desc}
        </p>
      </div>
      {selected && !disabled && (
        <CheckCircle2
          size={16}
          className="ml-auto mt-0.5 shrink-0 text-green-400"
        />
      )}
    </button>
  );
}
