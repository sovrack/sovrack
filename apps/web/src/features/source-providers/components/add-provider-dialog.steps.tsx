"use client";

import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import { PROVIDER_META, ProviderLogo, type ProviderType } from "./provider-meta";
import {
  AuthMethodCard,
  Collapsible,
  TextInput,
  Toggle,
  type AuthChoice,
} from "./provider-form-fields";
import { FormField } from "@/shared/ui/form-field";

/* ─── Step 1: provider type ─────────────────────────────────────────────── */

type ProviderTypeStepProps = {
  selectedType: ProviderType;
  onSelectType: (type: ProviderType) => void;
};

export function ProviderTypeStep({
  selectedType,
  onSelectType,
}: ProviderTypeStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Select Provider
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Choose the Git platform for this integration.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["GITLAB", "GITHUB"] as ProviderType[]).map((type) => {
          const meta = PROVIDER_META[type];
          const active = selectedType === type && meta.available;
          return (
            <button
              key={type}
              type="button"
              onClick={() => meta.available && onSelectType(type)}
              disabled={!meta.available}
              className={clsx(
                "relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition",
                active
                  ? "border-[var(--text-primary)] bg-[var(--hover)]"
                  : meta.available
                    ? "border-[var(--border)] hover:border-[var(--text-secondary)] hover:bg-[var(--hover)]"
                    : "cursor-not-allowed border-[var(--border)] opacity-50",
              )}
            >
              <div
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-xl border",
                  meta.bgColor,
                  meta.borderColor,
                )}
              >
                <ProviderLogo type={type} className={clsx("h-5 w-5", meta.color)} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {meta.label}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {meta.tagline}
                </p>
              </div>
              {!meta.available && (
                <span className="absolute right-2 top-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                  {meta.badge ?? "Soon"}
                </span>
              )}
              {meta.available && meta.badge && !active && (
                <span className="absolute right-2 top-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-teal-400">
                  {meta.badge}
                </span>
              )}
              {active && (
                <CheckCircle2
                  size={14}
                  className="absolute right-2 top-2 text-green-400"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step 2: instance configuration ────────────────────────────────────── */

type InstanceConfigStepProps = {
  selectedType: ProviderType;
  name: string;
  providerUrl: string;
  internalUrl: string;
  isDefault: boolean;
  onNameChange: (v: string) => void;
  onProviderUrlChange: (v: string) => void;
  onInternalUrlChange: (v: string) => void;
  onIsDefaultChange: (v: boolean) => void;
};

export function InstanceConfigStep({
  selectedType,
  name,
  providerUrl,
  internalUrl,
  isDefault,
  onNameChange,
  onProviderUrlChange,
  onInternalUrlChange,
  onIsDefaultChange,
}: InstanceConfigStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Instance Configuration
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Configure the provider name and instance URL.
        </p>
      </div>

      <FormField label="Provider Name" required>
        <TextInput
          value={name}
          onChange={onNameChange}
          placeholder="e.g. GitLab Cloud, Company GitLab"
        />
      </FormField>

      <FormField
        label={`${PROVIDER_META[selectedType]?.label ?? "Git"} URL`}
        required
        hint={
          selectedType === "GITHUB"
            ? "Use https://github.com for GitHub.com, or your GitHub Enterprise URL."
            : "Use https://gitlab.com for the cloud version, or your self-hosted instance URL."
        }
      >
        <TextInput
          value={providerUrl}
          onChange={onProviderUrlChange}
          placeholder="https://gitlab.com"
        />
      </FormField>

      <Collapsible title="Advanced instance options">
        <FormField
          label="Internal URL"
          hint="Optional internal URL for Vaytek-to-GitLab communication (behind a firewall)."
        >
          <TextInput
            value={internalUrl}
            onChange={onInternalUrlChange}
            placeholder="https://gitlab.internal.company.com"
          />
        </FormField>
      </Collapsible>

      <Toggle
        value={isDefault}
        onChange={onIsDefaultChange}
        label="Set as default provider"
        hint="Projects will use this provider by default when connecting a repository."
      />
    </div>
  );
}

/* ─── Step 3: auth method ───────────────────────────────────────────────── */

type AuthMethodStepProps = {
  authChoice: AuthChoice;
  onSelectAuthChoice: (choice: AuthChoice) => void;
};

export function AuthMethodStep({
  authChoice,
  onSelectAuthChoice,
}: AuthMethodStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Authentication Method
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Choose how Vaytek authenticates with this provider.
        </p>
      </div>

      <div className="space-y-2">
        {(["oauth", "pat", "both"] as AuthChoice[]).map((choice) => (
          <AuthMethodCard
            key={choice}
            choice={choice}
            selected={authChoice === choice}
            onSelect={() => onSelectAuthChoice(choice)}
          />
        ))}
      </div>
    </div>
  );
}
