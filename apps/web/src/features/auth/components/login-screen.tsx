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
        <p className="mt-2 text-sm text-zinc-400">
          Connectez-vous à votre espace Sovrack.
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-5 flex items-center justify-between rounded-lg border border-sky-500/25 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200">
            <div>
              <p className="font-semibold text-white">Compte de test local</p>
              <p className="text-slate-300">owner@sovrack.test</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEmail("owner@sovrack.test");
                setPassword("Local-Client-2026!");
              }}
              className="rounded-md bg-sky-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400"
            >
              Pré-remplir
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isCapabilityEnabled("googleAuthentication") && (
            <>
              <GoogleLoginButton
                nextPath={searchParams.get("next") || undefined}
                className="rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800/80 text-zinc-200"
              />
              <div className="relative flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-zinc-800" />
                <span className="text-xs uppercase tracking-wider text-zinc-500 font-medium">
                  {t("or with your email")}
                </span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
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
              className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 transition focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
              >
                Mot de passe
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-zinc-400 transition hover:text-white"
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
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-zinc-500 transition focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label
                htmlFor="mfa-code"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
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
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-zinc-500 transition focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Ce champ apparaît uniquement car cette protection est activée sur votre compte.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 shadow-sm disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-400">
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
