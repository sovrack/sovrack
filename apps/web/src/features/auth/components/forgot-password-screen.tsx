"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
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
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <h1 className="text-3xl font-bold text-white">Mot de passe oublié</h1>
          <p className="mt-2 text-slate-500">
            Indiquez votre email pour recevoir un code de réinitialisation.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {sent ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-400/10 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-emerald-300">
                Code envoyé !
              </h2>
              <p className="mt-2 text-sm text-emerald-700">
                Si un compte existe avec cet email, un code à 6 chiffres vient
                de vous être envoyé. Il expire dans 10 minutes.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/reset-password")}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Saisir le code
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-10 space-y-5">
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
                  className="mt-1.5 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
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

          <p className="mt-8 text-center text-sm">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-semibold text-sky-400 hover:text-sky-300"
            >
              <ArrowLeft size={14} /> Retour à la connexion
            </Link>
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
