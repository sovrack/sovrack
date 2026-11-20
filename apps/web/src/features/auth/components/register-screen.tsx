"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "./auth-layout";
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

    setLoading(true);
    try {
      const pendingRegistrationId = await register({
        email,
        password,
        fullName,
        workspaceType: "PERSONAL",
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
      await verifyEmail(email, code, registrationId);
      const next = resolveSafeInternalPath(
        searchParams.get("next"),
        "/dashboard",
      );
      window.location.assign(next);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Code invalide ou expiré. Demandez un nouveau code.",
      );
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await resendCode(email, registrationId);
      setInfo("Un nouveau code a été envoyé par email.");
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Impossible d'envoyer un nouveau code. Réessayez plus tard.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    if (cleaned.length > 1) {
      const pasted = applyDigits(cleaned);
      const nextFocus = Math.min(pasted.length, 5);
      digitRefs.current[nextFocus]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
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

  const loginHref = searchParams.get("next")
    ? `/login?next=${encodeURIComponent(
        resolveSafeInternalPath(
          searchParams.get("next"),
          "/dashboard",
        ),
      )}`
    : "/login";

  return (
    <AuthLayout headerAction={{ label: "Se connecter", href: loginHref }}>
      <div className="w-full">
        {step === "form" ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Créer votre compte Sovrack
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Votre premier déploiement en quelques secondes.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            {isCapabilityEnabled("googleAuthentication") && (
              <div className="mt-6 space-y-4">
                <GoogleLoginButton
                  label={t("Sign up with Google")}
                  nextPath={searchParams.get("next") || undefined}
                  className="rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/10 text-slate-200"
                />
                <div className="relative flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">
                    {t("or with your email")}
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Developer"
                  autoComplete="name"
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@entreprise.com"
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
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
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  12 caractères minimum : majuscule, minuscule et chiffre
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 transition hover:bg-slate-100 shadow-sm disabled:opacity-50"
              >
                {loading ? "Création en cours..." : "Créer mon compte"}
              </button>

              <p className="text-center text-xs text-slate-500">
                En créant votre compte, vous acceptez nos{" "}
                <Link href="/terms" className="text-slate-300 hover:text-white underline">
                  conditions d&apos;utilisation
                </Link>
                .
              </p>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Vérifiez votre email
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Un code de validation à 6 chiffres a été envoyé à{" "}
              <span className="font-semibold text-white">{email}</span>.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}
            {info && (
              <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                {info}
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Code de vérification
                </label>
                <div className="mt-2.5 flex justify-between gap-2">
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
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(index, e)}
                      onPaste={handleDigitPaste}
                      aria-label={`Chiffre ${index + 1}`}
                      className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.04] text-center text-xl font-bold text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
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
                className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 transition hover:bg-slate-100 shadow-sm disabled:opacity-50"
              >
                {loading ? "Vérification..." : "Vérifier et accéder"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-xs font-medium text-slate-400 hover:text-white transition disabled:opacity-50"
              >
                Renvoyer le code
              </button>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Déjà un compte ?{" "}
          <Link
            href={loginHref}
            className="font-medium text-white transition hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
