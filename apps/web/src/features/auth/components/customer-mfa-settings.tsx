"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import {
  userMfaService,
  type UserMfaSetup,
  type UserMfaStatus,
} from "@/features/auth/api/user-mfa.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { SectionCard } from "@/shared/layout/section-card";
import { PasswordInput } from "@/shared/ui/password-input";

export function CustomerMfaSettings() {
  const [status, setStatus] = useState<UserMfaStatus | null>(null);
  const [setup, setSetup] = useState<UserMfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    userMfaService
      .status()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((reason) => {
        if (active) setError(getApiErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const beginSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await userMfaService.beginSetup());
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await userMfaService.enable(code);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode("");
      setStatus({
        enabled: true,
        required: false,
        recoveryCodesRemaining: result.recoveryCodes.length,
      });
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await userMfaService.disable(password, code);
      window.location.assign("/login?reason=mfa-disabled");
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!setup) return;
    await navigator.clipboard.writeText(setup.secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SectionCard
      title="Double authentification facultative"
      description="Elle reste désactivée par défaut. Votre email et votre mot de passe suffisent tant que vous ne choisissez pas de l'activer."
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!status ? (
        <div className="flex items-center gap-2 text-sm text-secondary">
          <Loader2 className="animate-spin" size={15} /> Vérification…
        </div>
      ) : recoveryCodes.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            Enregistrez ces codes maintenant. Ils ne seront plus affichés et
            chacun ne fonctionne qu’une fois.
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-app p-4 font-mono text-sm sm:grid-cols-2">
            {recoveryCodes.map((recoveryCode) => (
              <span key={recoveryCode}>{recoveryCode}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.location.assign("/login?reason=mfa-enabled")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            J’ai enregistré les codes — me reconnecter
          </button>
        </div>
      ) : status.enabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <ShieldCheck size={18} /> Protection activée ·{" "}
            {status.recoveryCodesRemaining} code(s) de secours restant(s)
          </div>
          <p className="text-sm leading-6 text-secondary">
            La désactivation exige votre mot de passe et un code actuel. Toutes
            vos sessions seront ensuite révoquées.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <PasswordInput
              id="mfa-disable-password"
              label="Mot de passe actuel"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Code TOTP ou de secours
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.trim())}
                className="mt-1 w-full rounded-lg border border-border bg-app px-3 py-2 font-mono text-sm normal-case text-primary outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !password || !code}
            onClick={() => void disable()}
            className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
          >
            Désactiver la double authentification
          </button>
        </div>
      ) : setup ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-secondary">
            Ajoutez manuellement cette clé dans Aegis, 2FAS, Google
            Authenticator ou une autre application TOTP, puis saisissez le code
            à six chiffres affiché.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-app p-3">
            <code className="min-w-0 flex-1 break-all text-sm text-primary">
              {setup.secret}
            </code>
            <button
              type="button"
              onClick={() => void copySecret()}
              aria-label="Copier la clé TOTP"
              className="rounded-lg border border-border p-2 text-secondary"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              placeholder="Code à 6 chiffres"
              className="rounded-lg border border-border bg-app px-3 py-2 font-mono text-sm text-primary outline-none"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={() => void enable()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <KeyRound size={14} />
              )}
              Activer volontairement
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-secondary">
            Optionnel : ajoutez une application TOTP et des codes de secours.
            Cette option n’est jamais imposée aux comptes clients.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void beginSetup()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            Configurer
          </button>
        </div>
      )}
    </SectionCard>
  );
}
