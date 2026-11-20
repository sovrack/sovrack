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
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          Connexion à Sovrack
        </h1>
        <p className="mt-2 text-sm text-secondary">
          Connectez-vous à votre espace Sovrack.
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
                <p className="text-secondary font-mono text-[11px]">owner@sovrack.test</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreFill}
                  className="rounded-lg border border-border bg-hover/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-hover/15 transition"
                >
                  Pré-remplir
                </button>
                <button
                  type="button"
                  onClick={handleLocalQuickLogin}
                  disabled={loading}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover transition "
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
                className="rounded-lg border border-border bg-card hover:bg-hover/15 text-primary"
              />
              <div className="relative flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-hover/15" />
                <span className="text-xs uppercase tracking-wider text-muted font-medium">
                  {t("or with your email")}
                </span>
                <span className="h-px flex-1 bg-hover/15" />
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium uppercase tracking-wider text-secondary"
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
              className="mt-1.5 w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-secondary"
              >
                Mot de passe
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-accent transition hover:text-accent"
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
                className="w-full rounded-lg border border-border bg-card px-4 py-2.5 pr-11 text-sm text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? "Masquer le mot de passe"
                    : "Afficher le mot de passe"
                }
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-secondary hover:text-primary"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {mfaRequired && (
            <div>
              <label
                htmlFor="mfa-code"
                className="block text-xs font-medium uppercase tracking-wider text-secondary"
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
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-4 py-2.5 font-mono text-sm text-primary placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <p className="mt-1.5 text-xs text-muted">
                Ce champ apparaît uniquement car cette protection est activée sur votre compte.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover   disabled:opacity-50"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-secondary">
          Pas encore de compte ?{" "}
          <Link
            href={registerHref}
            className="font-medium text-primary transition hover:underline"
          >
            S&rsquo;inscrire
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
