"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
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
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#2D6BB5] focus:ring-4 focus:ring-[#2D6BB5]/10";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="flex min-h-screen items-center justify-center bg-white px-6 py-12 sm:px-10 lg:min-h-0 lg:px-16 xl:px-24">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1B2B4B] shadow-sm">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              Sovrack
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Créer un compte
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Déploiements, serveurs et pipelines en un seul endroit.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Adresse email
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

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
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
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#1B2B4B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2D6BB5] focus:outline-none focus:ring-4 focus:ring-[#2D6BB5]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Création…" : "Créer mon compte"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Déjà un compte ?{" "}
            <a href="/login" className="font-medium text-[#2D6BB5] hover:underline">
              Se connecter
            </a>
          </p>
        </div>
      </section>

      <section
        className="hidden lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12 lg:py-16"
        style={{
          background: "linear-gradient(135deg, #1B2B4B 0%, #2D6BB5 100%)",
        }}
      >
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/60">
            Plateforme Sovrack
          </p>
          <h2 className="mt-3 text-3xl font-bold leading-snug text-white">
            14 jours d&apos;essai gratuit.
            <br />
            Aucune carte requise.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            Votre compte inclut une équipe, des projets et des serveurs
            managés. Passez au plan supérieur quand vous êtes prêt.
          </p>
          <div className="mt-10 space-y-4">
            <div className="flex items-start gap-4 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
              <div>
                <p className="text-sm font-semibold text-white">
                  Déploiements automatisés
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">
                  Poussez sur GitLab et regardez votre application se déployer
                  via Ansible.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-2xl bg-white/10 px-5 py-4 backdrop-blur-sm">
              <div>
                <p className="text-sm font-semibold text-white">
                  Serveurs managés
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">
                  Des hôtes provisionnés par la plateforme, avec un coût
                  mensuel transparent.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
