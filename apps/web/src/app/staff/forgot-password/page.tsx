"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { SovrackBrand } from "@/components/marketing/sovrack-logo";
import { staffService } from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";

export default function StaffForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await staffService.requestPasswordReset(email);
      setRequested(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-brand text-zinc-200">
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
              <h1 className="text-2xl font-bold text-white">
                Récupération Staff
              </h1>
              <p className="text-sm text-zinc-400">Back-office Sovrack</p>
            </div>
          </div>

          {requested ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
              <CheckCircle2 className="text-emerald-400" size={32} />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Demande prise en compte
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Si ce compte Staff existe et est actif, un code à 8 chiffres a
                été envoyé. Il expire dans 10 minutes.
              </p>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/staff/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`,
                  )
                }
                className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950"
              >
                Saisir le code
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-10 space-y-5">
              <p className="text-sm leading-relaxed text-zinc-400">
                Indiquez l’adresse de votre compte Staff. La réponse ne révèle
                jamais si un compte existe.
              </p>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Email Staff
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                />
              </label>
              {error ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Mail size={16} />
                {loading ? "Envoi…" : "Envoyer le code"}
              </button>
            </form>
          )}

          <Link
            href="/staff/login"
            className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-sky-400 hover:text-sky-300"
          >
            <ArrowLeft size={14} /> Retour à la connexion Staff
          </Link>
        </div>
      </section>
    </main>
  );
}
