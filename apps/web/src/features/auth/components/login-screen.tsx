"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "./auth-layout";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";
import { GoogleLoginButton } from "./google-login-button";
import { resolveSafeInternalPath } from "@/shared/lib/safe-navigation";
import { useLanguage } from "@/shared/i18n/language-context";

function resolveOAuthErrorMessage(error: string | null, t: (s: string) => string): string {
  if (!error) return "";
  if (error === "oauth_not_configured") {
    return t("Google authentication is not configured on this server.");
  }
  if (error === "account_disabled") {
    return t("Your account is disabled.");
  }
  if (error === "oauth_callback_failed" || error === "oauth_failed") {
    return t("Google authentication failed. Please try again.");
  }
  if (error === "oauth_cancelled") {
    return t("Google authentication cancelled.");
  }
  return decodeURIComponent(error);
}

export function LoginScreen() {
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { t } = useLanguage();
  const oauthError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState(
    resolveOAuthErrorMessage(oauthError, t),
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, mfaRequired ? mfaCode : undefined);
      const next = resolveSafeInternalPath(
        searchParams.get("next"),
        "/dashboard",
      );
      window.location.assign(next);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } }).response
        ?.data?.code;
      if (code === "USER_MFA_REQUIRED") {
        setMfaRequired(true);
        setError("");
        return;
      }
      setError(
        getApiErrorMessage(err) ||
        "Email ou mot de passe incorrect. Veuillez réessayer.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePreFill = () => {
    setEmail("owner@sovrack.test");
    setPassword("Local-Client-2026!");
    setError("");
  };

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

  const registerHref = searchParams.get("next")
    ? `/register?next=${encodeURIComponent(
      resolveSafeInternalPath(
        searchParams.get("next"),
        "/dashboard",
      ),
    )}`
    : "/register";

  return (
    <AuthLayout headerAction={{ label: "Créer un compte", href: registerHref }}>
      <div className="w-full">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Connexion à Sovrack
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Connectez-vous à votre espace Sovrack.
        </p>

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-xs text-blue-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-semibold text-white">Compte de test local</p>
                <p className="text-slate-300 font-mono text-[11px]">owner@sovrack.test</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreFill}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition"
                >
                  Pré-remplir
                </button>
                <button
                  type="button"
                  onClick={handleLocalQuickLogin}
                  disabled={loading}
                  className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8] transition shadow-sm"
                >
                  {loading ? "Connexion..." : "Connexion 1-clic →"}
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isCapabilityEnabled("googleAuthentication") && (
            <>
              <GoogleLoginButton
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
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-slate-400"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@entreprise.com"
              autoComplete="email"
              required
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Mot de passe
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-blue-400 transition hover:text-blue-300"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <div className="relative mt-1.5">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 pr-11 text-sm text-white placeholder:text-slate-500 transition focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label
                htmlFor="mfa-code"
                className="block text-xs font-medium uppercase tracking-wider text-slate-400"
              >
                Code de double authentification
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.trim())}
                placeholder="123456 ou code de secours"
                required
                autoFocus
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Ce champ apparaît uniquement car cette protection est activée sur votre compte.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white transition hover:bg-[#1d4ed8] shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-400">
          Pas encore de compte ?{" "}
          <Link
            href={registerHref}
            className="font-medium text-white transition hover:underline"
          >
            S&rsquo;inscrire
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
