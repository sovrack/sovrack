"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  const { register, verifyEmail, resendCode, login, pendingDevCode } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState<Step>("form");
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

  useEffect(() => {
    if (step === "verify" && pendingDevCode) {
      applyDigits(pendingDevCode);
    }
  }, [step, pendingDevCode]);

  const handleLocalQuickLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await login("owner@sovrack.test", "Local-Client-2026!");
      const next = resolveSafeInternalPath(
        searchParams.get("next"),
        "/dashboard",
      );
      window.location.assign(next);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) || "Impossible de se connecter au compte local.",
      );
      setLoading(false);
    }
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
      const derivedFullName = email.split("@")[0] || "User";
      const pendingRegistrationId = await register({
        email,
        password,
        fullName: derivedFullName,
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
            <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              Créer votre compte Sovrack
            </h1>
            <p className="mt-2 text-sm text-secondary">
              Votre premier déploiement en quelques secondes.
            </p>

            {error && (
              <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            {process.env.NODE_ENV !== "production" && (
              <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 p-3.5 text-xs text-accent">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-primary">Compte de test local</p>
                    <p className="text-secondary font-mono text-[11px]">
                      owner@sovrack.test (accès instantané)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLocalQuickLogin}
                    disabled={loading}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover transition "
                  >
                    {loading ? "Connexion..." : "Connexion Démo (1 clic) →"}
                  </button>
                </div>
              </div>
            )}

            {isCapabilityEnabled("googleAuthentication") && (
              <div className="mt-6 space-y-4">
                <GoogleLoginButton
                  label={t("Sign up with Google")}
                  nextPath={searchParams.get("next") || undefined}
                  className="rounded-lg border border-border bg-card hover:bg-hover/15 text-primary"
                />
                <div className="relative flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-hover/15" />
                  <span className="text-xs uppercase tracking-wider text-muted font-medium">
                    {t("or with your email")}
                  </span>
                  <span className="h-px flex-1 bg-hover/15" />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@entreprise.com"
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
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
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <p className="mt-1.5 text-xs text-muted">
                  12 caractères minimum : majuscule, minuscule et chiffre
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover   disabled:opacity-50"
              >
                {loading ? "Création en cours..." : "Créer mon compte"}
              </button>

              <p className="text-center text-xs text-muted">
                En créant votre compte, vous acceptez nos{" "}
                <Link href="/terms" className="text-secondary hover:text-primary underline">
                  conditions d&apos;utilisation
                </Link>
                .
              </p>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
              Vérifiez votre email
            </h1>
            <p className="mt-2 text-sm text-secondary">
              Un code de validation à 6 chiffres a été envoyé à{" "}
              <span className="font-semibold text-primary">{email}</span>.
            </p>

            {pendingDevCode && (
              <div className="mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-accent flex items-center justify-between">
                <span>
                  Code détecté (démo/dev) :{" "}
                  <strong className="font-mono text-primary text-sm tracking-widest">
                    {pendingDevCode}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => applyDigits(pendingDevCode)}
                  className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground hover:bg-accent-hover transition"
                >
                  Remplir
                </button>
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}
            {info && (
              <div className="mt-5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
                {info}
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-secondary">
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
                      className="h-12 w-full rounded-lg border border-border bg-card text-center text-xl font-bold text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Le code expire dans 10 minutes.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover   disabled:opacity-50"
              >
                {loading ? "Vérification..." : "Vérifier et accéder"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-xs font-medium text-secondary hover:text-primary transition disabled:opacity-50"
              >
                Renvoyer le code
              </button>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-xs text-secondary">
          Déjà un compte ?{" "}
          <Link
            href={loginHref}
            className="font-medium text-primary transition hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
