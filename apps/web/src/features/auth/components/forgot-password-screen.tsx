"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "./auth-layout";
import api, { getApiErrorMessage } from "@/shared/lib/api";

export function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post<{ sent: boolean }>("/auth/forgot-password", { email });
      setSent(true);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout headerAction={{ label: "Se connecter", href: "/login" }}>
      <div className="w-full">
        <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
          Mot de passe oublié
        </h1>
        <p className="mt-2 text-sm text-secondary">
          Indiquez votre email pour recevoir un code de réinitialisation.
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {sent ? (
          <div className="mt-6 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-5 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-emerald-300">
              Code envoyé !
            </h2>
            <p className="mt-2 text-xs text-emerald-200/80">
              Si un compte existe avec cet email, un code à 6 chiffres vient de vous être envoyé. Il expire dans 10 minutes.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/reset-password")}
              className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-primary transition hover:bg-emerald-400"
            >
              Saisir le code
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
                className="mt-1.5 w-full rounded-lg border border-border bg-card/80 px-3.5 py-2.5 text-sm text-primary placeholder:text-muted transition focus:border-border focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover  disabled:opacity-50"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Mail size={16} />
              )}{" "}
              Envoyer le code
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-secondary">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 font-medium text-primary transition hover:underline"
          >
            <ArrowLeft size={13} /> Retour à la connexion
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
