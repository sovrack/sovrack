"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";

export function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const passwordOk = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
    if (!passwordOk) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre.",
      );
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, fullName, teamName });
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Impossible de créer le compte. Vérifiez vos informations.",
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />

      <section className="mx-auto flex max-w-lg px-6 pb-24 pt-16">
        <div className="w-full">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
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
          <h1 className="mt-6 text-3xl font-bold">Créer votre compte</h1>
          <p className="mt-2 text-slate-500">
            Créez votre compte et accédez à votre espace Sovrack.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
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
                <label className="block text-sm font-medium text-slate-700">
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
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Nom de l&apos;équipe
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Mon équipe"
                autoComplete="organization"
                required
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-400">
                Votre compte inclut une équipe, des projets et des serveurs
                managés.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                autoComplete="new-password"
                required
                minLength={8}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-400">
                8 caractères minimum : majuscule, minuscule et chiffre
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Création en cours..." : "Créer mon compte"}
            </button>

            <p className="text-center text-xs text-slate-400">
              En créant votre compte, vous acceptez nos{" "}
              <Link href="/legal" className="text-blue-600 hover:underline">
                conditions d&apos;utilisation
              </Link>
              .
            </p>
          </form>

          <p className="mt-10 text-center text-sm text-slate-500">
            Déjà un compte ?{" "}
            <Link
              href="/login"
              className="font-semibold text-blue-600 hover:text-blue-700"
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
