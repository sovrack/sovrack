"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
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

  return (
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <h1 className="text-3xl font-bold text-white">Connexion</h1>
          <p className="mt-2 text-slate-400">
            Connectez-vous à votre espace Sovrack.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            {isCapabilityEnabled("googleAuthentication") && (
              <>
                <GoogleLoginButton nextPath={searchParams.get("next") || undefined} />
                <div className="relative flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {t("or with your email")}
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300"
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
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300"
              >
                Mot de passe
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Votre mot de passe"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 pr-11 text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {mfaRequired && (
              <div>
                <label
                  htmlFor="mfa-code"
                  className="block text-sm font-medium text-slate-300"
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
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Ce champ apparaît uniquement parce que vous avez activé
                  volontairement cette protection sur votre compte.
                </p>
              </div>
            )}
            <div className="text-right">
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-sky-400 hover:text-sky-300"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-slate-400">
            Pas encore de compte ?{" "}
            <Link
              href={
                searchParams.get("next")
                  ? `/register?next=${encodeURIComponent(
                      resolveSafeInternalPath(
                        searchParams.get("next"),
                        "/dashboard",
                      ),
                    )}`
                  : "/register"
              }
              className="font-semibold text-sky-400 hover:text-sky-300"
            >
              S&rsquo;inscrire
            </Link>
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
