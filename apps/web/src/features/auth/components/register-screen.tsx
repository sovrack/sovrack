"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, UserRound } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { resolveSafeInternalPath } from "@/shared/lib/safe-navigation";
import { GoogleLoginButton } from "./google-login-button";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { useLanguage } from "@/shared/i18n/language-context";
import {
  SOVRACK_PASSWORD_MAX_LENGTH,
  SOVRACK_PASSWORD_MESSAGE,
  SOVRACK_PASSWORD_MIN_LENGTH,
  isSovrackPassword,
} from "@/shared/lib/password-policy";

type Step = "form" | "verify";

export function RegisterScreen() {
  const searchParams = useSearchParams();
  const { register, verifyEmail, resendCode } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceType, setWorkspaceType] = useState<
    "PERSONAL" | "ORGANIZATION"
  >("PERSONAL");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationId, setRegistrationId] = useState("");

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  const applyDigits = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    const next = Array(6).fill("");
    for (let i = 0; i < cleaned.length; i++) {
      next[i] = cleaned[i];
    }
    setDigits(next);
    return cleaned;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!isSovrackPassword(password)) {
      setError(SOVRACK_PASSWORD_MESSAGE);
      return;
    }
    if (workspaceType === "ORGANIZATION" && !workspaceName.trim()) {
      setError("Indiquez le nom de votre organisation.");
      return;
    }

    setLoading(true);
    try {
      const pendingRegistrationId = await register({
        email,
        password,
        fullName,
        workspaceType,
        ...(workspaceType === "ORGANIZATION"
          ? { workspaceName: workspaceName.trim() }
          : {}),
      });
      setRegistrationId(pendingRegistrationId);
      setLoading(false);
      setStep("verify");
      digitRefs.current[0]?.focus();
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Impossible de créer le compte. Vérifiez vos informations.",
      );
      setLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Entrez le code à 6 chiffres reçu par email.");
      return;
    }

    setLoading(true);
    try {
      if (!registrationId) {
        throw new Error("La tentative d'inscription a expiré. Recommencez.");
      }
      await verifyEmail(email, code, registrationId);
      window.location.assign(
        resolveSafeInternalPath(searchParams.get("next"), "/dashboard"),
      );
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) || "Le code est invalide ou expiré. Réessayez.",
      );
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (!registrationId) {
        throw new Error("La tentative d'inscription a expiré. Recommencez.");
      }
      await resendCode(email, registrationId);
      setInfo("Un nouveau code a été envoyé par email.");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || "Impossible de renvoyer le code.");
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) return;
    const next = [...digits];
    for (let i = 0; i < cleaned.length && index + i < 6; i++) {
      next[index + i] = cleaned[i];
    }
    setDigits(next);
    const focusIndex = Math.min(index + cleaned.length, 5);
    digitRefs.current[focusIndex]?.focus();
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData("text"));
    const nextFocus = Math.min(e.clipboardData.getData("text").length, 5);
    digitRefs.current[nextFocus]?.focus();
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20";

  return (
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <section className="mx-auto flex max-w-lg px-6 pb-24 pt-16">
        <div className="w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour
          </Link>

          {step === "form" ? (
            <>
              <h1 className="mt-6 text-3xl font-bold text-white">
                Créer votre compte
              </h1>
              <p className="mt-2 text-slate-500">
                Créez votre compte et accédez à votre espace Sovrack.
              </p>

              {error && (
                <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {isCapabilityEnabled("googleAuthentication") && (
                <div className="mt-8 space-y-4">
                  <GoogleLoginButton
                    label={t("Sign up with Google")}
                    nextPath={searchParams.get("next") || undefined}
                  />
                  <div className="relative flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-white/10" />
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      {t("or with your email")}
                    </span>
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Nom complet
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Developer"
                      autoComplete="name"
                      required
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vous@entreprise.com"
                      autoComplete="email"
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <fieldset>
                  <legend className="block text-sm font-medium text-slate-300">
                    Comment allez-vous utiliser Sovrack&nbsp;?
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        workspaceType === "PERSONAL"
                          ? "border-sky-400 bg-sky-400/10 ring-2 ring-sky-400/20"
                          : "border-white/15 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="workspaceType"
                        value="PERSONAL"
                        checked={workspaceType === "PERSONAL"}
                        onChange={() => setWorkspaceType("PERSONAL")}
                        className="sr-only"
                      />
                      <span className="flex items-center gap-2 font-semibold text-white">
                        <UserRound size={17} /> Personnel
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-400">
                        Pour vous seul. Aucun membre ni invitation.
                      </span>
                    </label>
                    <label
                      className={`cursor-pointer rounded-xl border p-4 transition ${
                        workspaceType === "ORGANIZATION"
                          ? "border-sky-400 bg-sky-400/10 ring-2 ring-sky-400/20"
                          : "border-white/15 bg-white/5 hover:border-white/30"
                      }`}
                    >
                      <input
                        type="radio"
                        name="workspaceType"
                        value="ORGANIZATION"
                        checked={workspaceType === "ORGANIZATION"}
                        onChange={() => setWorkspaceType("ORGANIZATION")}
                        className="sr-only"
                      />
                      <span className="flex items-center gap-2 font-semibold text-white">
                        <Building2 size={17} /> Organisation
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-400">
                        Pour collaborer avec une équipe et attribuer des rôles.
                      </span>
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Un espace personnel peut être converti plus tard en
                    organisation. La conversion est définitive.
                  </p>
                </fieldset>

                {workspaceType === "ORGANIZATION" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300">
                      Nom de l&apos;organisation
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Acme Engineering"
                      autoComplete="organization"
                      required
                      maxLength={120}
                      className={inputClass}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Ce nom sera visible par les membres invités.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="12 caractères minimum"
                    autoComplete="new-password"
                    required
                    minLength={SOVRACK_PASSWORD_MIN_LENGTH}
                    maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    12 caractères minimum : majuscule, minuscule et chiffre
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? "Création en cours..." : "Créer mon compte"}
                </button>

                <p className="text-center text-xs text-slate-500">
                  En créant votre compte, vous acceptez nos{" "}
                  <Link href="/legal" className="text-sky-400 hover:underline">
                    conditions d&apos;utilisation
                  </Link>
                  .
                </p>
              </form>
            </>
          ) : (
            <>
              <h1 className="mt-6 text-3xl font-bold text-white">
                Vérifiez votre email
              </h1>
              <p className="mt-2 text-slate-500">
                Nous avons envoyé un code de validation à{" "}
                <span className="font-medium text-slate-300">{email}</span>.
              </p>

              {error && (
                <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              {info && (
                <div className="mt-6 rounded-xl border border-green-200 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300">
                  {info}
                </div>
              )}

              <form onSubmit={handleVerify} className="mt-10 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Code de vérification
                  </label>
                  <div className="mt-3 flex justify-between gap-2">
                    {digits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          digitRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={digit}
                        onChange={(e) =>
                          handleDigitChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleDigitKeyDown(index, e)}
                        onPaste={handleDigitPaste}
                        aria-label={`Chiffre ${index + 1}`}
                        className="h-14 w-full rounded-xl border border-white/15 bg-white/5 text-center text-2xl font-bold text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Le code expire dans 10 minutes.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? "Vérification..." : "Vérifier et accéder"}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="w-full text-center text-sm font-medium text-sky-400 hover:text-sky-300 disabled:opacity-50"
                >
                  Renvoyer le code
                </button>
              </form>
            </>
          )}

          <p className="mt-10 text-center text-sm text-slate-500">
            Déjà un compte ?{" "}
            <Link
              href="/login"
              className="font-semibold text-sky-400 hover:text-sky-300"
            >
              Se connecter
            </Link>
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
