"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";
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
    <main className="min-h-screen bg-app text-primary">
      <header className="border-b border-border bg-app/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Link href="/" className="flex items-center">
            <SovrackBrand logoClassName="h-7 w-7 text-primary" textClassName="text-primary" />
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-primary">
                Récupération Staff
              </h1>
              <p className="text-sm text-secondary">Back-office Sovrack</p>
            </div>
          </div>

          {requested ? (
            <div className="mt-8 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-6">
              <CheckCircle2 className="text-emerald-400" size={32} />
              <h2 className="mt-4 text-lg font-semibold text-primary">
                Demande prise en compte
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
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
                className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
              >
                Saisir le code
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-10 space-y-5">
              <p className="text-sm leading-relaxed text-secondary">
                Indiquez l’adresse de votre compte Staff. La réponse ne révèle
                jamais si un compte existe.
              </p>
              <label className="block">
                <span className="text-sm font-medium text-secondary">
                  Email Staff
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className="mt-1.5 w-full rounded-lg border border-border bg-hover/10 px-4 py-2.5 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </label>
              {error ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground   transition hover:bg-accent-hover disabled:opacity-50"
              >
                <Mail size={16} />
                {loading ? "Envoi…" : "Envoyer le code"}
              </button>
            </form>
          )}

          <Link
            href="/staff/login"
            className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:text-accent"
          >
            <ArrowLeft size={14} /> Retour à la connexion Staff
          </Link>
        </div>
      </section>
    </main>
  );
}
