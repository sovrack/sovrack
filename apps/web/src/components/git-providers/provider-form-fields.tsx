'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Key,
  Shield,
} from 'lucide-react';

/* ─── Step indicator ────────────────────────────────────────────────────── */

export function StepIndicator({ current, total }: { current: number; total: number }) {
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
                'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-all',
                active
                  ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-app)]'
                  : done
                    ? 'border-green-500/40 bg-green-500/10 text-green-400'
                    : 'border-[var(--border)] text-[var(--text-muted)]',
              )}
            >
              {done ? <Check size={12} /> : num}
            </div>
            {i < total - 1 && (
              <div
                className={clsx(
                  'mx-1 h-px w-8 transition-all',
                  done ? 'bg-green-500/40' : 'bg-[var(--border)]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Field helpers ─────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={clsx(
        'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--text-secondary)]/10 disabled:opacity-60',
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
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={alreadySet ? `${label} already set — leave blank to keep` : (placeholder ?? '')}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--text-secondary)] focus:ring-2 focus:ring-[var(--text-secondary)]/10"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
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
      className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-3 text-left transition hover:bg-[var(--hover)]"
    >
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
      <div
        className={clsx(
          'relative h-5 w-9 shrink-0 rounded-full border transition-all',
          value
            ? 'border-green-500/50 bg-green-500/20'
            : 'border-[var(--border)] bg-[var(--hover)]',
        )}
      >
        <div
          className={clsx(
            'absolute top-0.5 h-4 w-4 rounded-full border transition-all',
            value
              ? 'left-4 border-green-400 bg-green-400'
              : 'left-0.5 border-[var(--border)] bg-[var(--text-muted)]',
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
    <div className="rounded-lg border border-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-4 pb-4 pt-3 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Auth method selector ───────────────────────────────────────────────── */

export type AuthChoice = 'oauth' | 'pat' | 'both';

export function AuthMethodCard({
  choice,
  selected,
  onSelect,
}: {
  choice: AuthChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  const map: Record<AuthChoice, { icon: React.ReactNode; title: string; desc: string }> = {
    oauth: {
      icon: <Shield size={18} className="text-blue-400" />,
      title: 'OAuth',
      desc: 'Authorize via OAuth app. Users log in with their GitLab account.',
    },
    pat: {
      icon: <Key size={18} className="text-amber-400" />,
      title: 'Personal Access Token',
      desc: 'Use a GitLab PAT with api, read_repository, write_repository scopes.',
    },
    both: {
      icon: (
        <span className="flex items-center gap-1">
          <Shield size={15} className="text-blue-400" />
          <Key size={15} className="text-amber-400" />
        </span>
      ),
      title: 'Both',
      desc: 'Configure OAuth for user login and PAT for automated operations.',
    },
  };
  const item = map[choice];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition',
        selected
          ? 'border-[var(--text-primary)] bg-[var(--hover)]'
          : 'border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--hover)]',
      )}
    >
      <div className="mt-0.5 shrink-0">{item.icon}</div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.desc}</p>
      </div>
      {selected && (
        <CheckCircle2 size={16} className="ml-auto mt-0.5 shrink-0 text-green-400" />
      )}
    </button>
  );
}
