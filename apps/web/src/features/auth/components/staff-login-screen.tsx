"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffStore } from "@/stores/staff.store";
import { getApiErrorMessage } from "@/shared/lib/api";
import { ShieldCheck } from "lucide-react";
import { SovrackBrand } from "@/components/marketing/sovrack-logo";

export function StaffLoginScreen() {
  const router = useRouter();
  const login = useStaffStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/staff");
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Identifiants incorrects. Veuillez réessayer.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand text-zinc-200">
      <header className="border-b border-white/10 bg-brand/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Link href="/" className="flex items-center">
            <SovrackBrand logoSize={30} textClassName="text-white" />
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">Back-office</h1>
              <p className="text-sm text-zinc-400">Équipe de la plateforme</p>
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-zinc-400">
            Accès réservé à l&apos;équipe d&apos;administration : gestion des
            comptes clients, des équipes et des abonnements.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-zinc-300"
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
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-zinc-300"
              >
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                required
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Accéder au back-office"}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-zinc-500">
            Espace client ?{" "}
            <Link
              href="/login"
              className="font-semibold text-zinc-300 hover:text-white"
            >
              Se connecter à la plateforme
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
