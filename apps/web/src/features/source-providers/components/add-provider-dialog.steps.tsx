"use client";

import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";
import {
  PROVIDER_META,
  ProviderLogo,
  type ProviderType,
} from "./provider-meta";
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
          Sélection du fournisseur
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Choisissez la plateforme Git à connecter.
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
                <ProviderLogo
                  type={type}
                  className={clsx("h-5 w-5", meta.color)}
                />
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
                  {meta.badge ?? "Bientôt"}
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
          Configuration de l’instance
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Donnez un nom à la connexion et indiquez l’URL de l’instance.
        </p>
      </div>

      <FormField label="Nom du fournisseur" required>
        <TextInput
          value={name}
          onChange={onNameChange}
          placeholder="Ex. GitLab Cloud, GitLab de l’entreprise"
        />
      </FormField>

      <FormField
        label={`${PROVIDER_META[selectedType]?.label ?? "Git"} URL`}
        required
        hint={
          selectedType === "GITHUB"
            ? "Utilisez https://github.com ou l’URL de votre instance GitHub Enterprise."
            : "Utilisez https://gitlab.com ou l’URL de votre instance auto-hébergée."
        }
      >
        <TextInput
          value={providerUrl}
          onChange={onProviderUrlChange}
          placeholder="https://gitlab.com"
        />
      </FormField>

      <Collapsible title="Options avancées de l’instance">
        <FormField
          label="URL interne"
          hint="URL interne facultative utilisée par Sovrack pour joindre l’instance derrière un pare-feu."
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
        label="Définir comme fournisseur par défaut"
        hint="Ce fournisseur sera présélectionné lors de la connexion d’un dépôt."
      />
    </div>
  );
}

/* ─── Step 3: auth method ───────────────────────────────────────────────── */

type AuthMethodStepProps = {
  providerType: ProviderType;
  authChoice: AuthChoice;
  onSelectAuthChoice: (choice: AuthChoice) => void;
};

export function AuthMethodStep({
  providerType,
  authChoice,
  onSelectAuthChoice,
}: AuthMethodStepProps) {
  const isGithub = providerType === "GITHUB";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Méthode d’authentification
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {isGithub
            ? "GitHub utilise en V1 un jeton personnel limité aux dépôts nécessaires."
            : "Choisissez la méthode utilisée par Sovrack pour s’authentifier."}
        </p>
      </div>

      <div className="space-y-2">
        {(isGithub
          ? (["pat"] as AuthChoice[])
          : (["oauth", "pat", "both"] as AuthChoice[])
        ).map((choice) => (
          <AuthMethodCard
            key={choice}
            choice={choice}
            selected={authChoice === choice}
            onSelect={() => onSelectAuthChoice(choice)}
            providerLabel={isGithub ? "GitHub" : "GitLab"}
          />
        ))}
      </div>

      {isGithub && (
        <p className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
          OAuth GitHub n’est pas inclus dans la V1. Le jeton est chiffré avant
          stockage, n’est jamais réaffiché et peut être remplacé à tout moment.
        </p>
      )}
    </div>
  );
}
