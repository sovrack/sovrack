"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { PasswordInput } from "@/shared/ui/password-input";
import api, { getApiErrorMessage } from "@/shared/lib/api";

export function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setLoading(true);
    try {
      await api.post<{ message: string }>("/auth/reset-password", {
        email,
        code,
        password,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || "Code invalide ou expiré.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <h1 className="text-3xl font-bold text-white">Nouveau mot de passe</h1>
          <p className="mt-2 text-slate-500">
            Saisissez l&apos;email, le code reçu et votre nouveau mot de passe.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {done ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-400/10 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-emerald-300">
                Mot de passe réinitialisé !
              </h2>
              <p className="mt-2 text-sm text-emerald-700">
                Vous pouvez maintenant vous connecter avec votre nouveau mot de
                passe.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/login")}
                className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Se connecter
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
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-slate-300"
                >
                  Code de vérification (6 chiffres)
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 px-4 py-2.5 text-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              </div>
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Nouveau mot de passe
                </label>
                <div className="mt-1.5">
                  <PasswordInput
                    id="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium text-slate-300"
                >
                  Confirmer le mot de passe
                </label>
                <div className="mt-1.5">
                  <PasswordInput
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Répétez le mot de passe"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <KeyRound size={16} />
                )}{" "}
                Réinitialiser le mot de passe
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