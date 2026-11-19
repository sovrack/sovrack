"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, RefreshCcw, ShieldCheck } from "lucide-react";
import {
  staffService,
  type StaffMfaSetup,
  type StaffMfaStatus,
} from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { clearStaffStorage, useStaffStore } from "@/stores/staff.store";

export default function StaffSecurityPage() {
  const router = useRouter();
  const clearStaff = useStaffStore((state) => state.clearStaff);
  const [status, setStatus] = useState<StaffMfaStatus | null>(null);
  const [setup, setSetup] = useState<StaffMfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void staffService
      .getMfaStatus()
      .then(setStatus)
      .catch((requestError: unknown) =>
        setError(getApiErrorMessage(requestError)),
      );
  }, []);

  const beginSetup = async () => {
    setLoading(true);
    setError("");
    try {
      setSetup(await staffService.beginMfaSetup());
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const enable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await staffService.enableMfa(code);
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setStatus((current) =>
        current
          ? {
              ...current,
              enabled: true,
              recoveryCodesRemaining: result.recoveryCodes.length,
            }
          : current,
      );
      setCode("");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await staffService.resetMfa(password, code);
      clearStaffStorage();
      clearStaff();
      router.replace("/staff/login?reason=mfa-reset");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError));
      setLoading(false);
    }
  };

  const finishEnrollment = () => {
    clearStaffStorage();
    clearStaff();
    router.replace("/staff/login?reason=mfa-enabled");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white">Sécurité du compte</h1>
          <p className="text-sm text-zinc-400">
            Authentification à deux facteurs du back-office.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!status ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-zinc-400">
          Chargement de la politique de sécurité…
        </div>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-white">Application TOTP</h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Utilisez une application compatible, par exemple Aegis, 2FAS,
                Google Authenticator ou Microsoft Authenticator.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                status.enabled
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {status.enabled
                ? "Activée"
                : status.required
                  ? "Obligatoire"
                  : "Inactive"}
            </span>
          </div>

          {!status.enabled && !setup && recoveryCodes.length === 0 && (
            <button
              type="button"
              onClick={beginSetup}
              disabled={loading}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <KeyRound size={16} />
              Configurer mon authentificateur
            </button>
          )}

          {setup && (
            <form onSubmit={enable} className="mt-6 space-y-5">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Clé de configuration manuelle
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <code className="break-all text-sm tracking-wider text-sky-300">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(setup.secret)}
                    title="Copier la clé"
                    className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="totp-code" className="text-sm text-zinc-300">
                  Code à 6 chiffres affiché par l&apos;application
                </label>
                <input
                  id="totp-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-blue-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                Vérifier et activer
              </button>
            </form>
          )}

          {recoveryCodes.length > 0 && (
            <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
              <h3 className="font-semibold text-amber-200">
                Enregistrez ces codes maintenant
              </h3>
              <p className="mt-1 text-sm text-amber-100/70">
                Ils ne seront plus affichés. Chaque code remplace une seule fois
                le code de votre application.
              </p>
              <div className="mt-4 grid gap-2 font-mono text-sm text-white sm:grid-cols-2">
                {recoveryCodes.map((recoveryCode) => (
                  <code key={recoveryCode}>{recoveryCode}</code>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(recoveryCodes.join("\n"))
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  <Copy size={15} /> Copier les codes
                </button>
                <button
                  type="button"
                  onClick={finishEnrollment}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  J&apos;ai sauvegardé — me reconnecter
                </button>
              </div>
            </div>
          )}

          {status.enabled && recoveryCodes.length === 0 && (
            <div className="mt-6 space-y-5">
              <p className="text-sm text-zinc-400">
                Codes de secours disponibles : {status.recoveryCodesRemaining}
                /10.
              </p>
              <form
                onSubmit={reset}
                className="space-y-4 rounded-xl border border-white/10 p-4"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <RefreshCcw size={16} /> Remplacer l&apos;authentificateur
                </div>
                <p className="text-xs leading-relaxed text-zinc-500">
                  Cette action exige votre mot de passe et un second facteur,
                  révoque toutes les sessions et impose une nouvelle
                  configuration à la prochaine connexion.
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mot de passe actuel"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-blue-400"
                />
                <input
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  placeholder="TOTP ou code de secours"
                  autoComplete="one-time-code"
                  required
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-white outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Réinitialiser la MFA
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
