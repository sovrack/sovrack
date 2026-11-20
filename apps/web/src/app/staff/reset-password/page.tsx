"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { SovrackBrand } from "@/components/marketing/sovrack-logo";
import { staffService } from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  SOVRACK_PASSWORD_MAX_LENGTH,
  SOVRACK_PASSWORD_MESSAGE,
  SOVRACK_PASSWORD_MIN_LENGTH,
  isSovrackPassword,
} from "@/shared/lib/password-policy";

export default function StaffResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <StaffResetPasswordForm />
    </Suspense>
  );
}

function StaffResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!isSovrackPassword(password)) {
      setError(SOVRACK_PASSWORD_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      await staffService.resetPassword(email, code, password);
      setCompleted(true);
      window.history.replaceState(null, "", "/staff/reset-password");
    } catch (resetError) {
      setError(getApiErrorMessage(resetError));
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

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-16">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Nouveau mot de passe Staff
              </h1>
              <p className="text-sm text-zinc-400">Back-office Sovrack</p>
            </div>
          </div>

          {completed ? (
            <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
              <CheckCircle2 className="text-emerald-400" size={32} />
              <h2 className="mt-4 text-lg font-semibold text-white">
                Mot de passe modifié
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Toutes les anciennes sessions Staff ont été révoquées.
              </p>
              <button
                type="button"
                onClick={() => router.replace("/staff/login")}
                className="mt-5 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950"
              >
                Se connecter au back-office
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-10 space-y-4">
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
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Code à 8 chiffres
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-center text-lg tracking-[0.35em] text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Nouveau mot de passe
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={SOVRACK_PASSWORD_MIN_LENGTH}
                  maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">
                  Confirmer le mot de passe
                </span>
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <p className="text-xs leading-relaxed text-zinc-500">
                {SOVRACK_PASSWORD_MESSAGE}
              </p>
              {error ? (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading || code.length !== 8}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                <KeyRound size={16} />
                {loading ? "Réinitialisation…" : "Modifier le mot de passe"}
              </button>
            </form>
          )}

          <Link
            href="/staff/forgot-password"
            className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-sky-400 hover:text-sky-300"
          >
            <ArrowLeft size={14} /> Demander un nouveau code
          </Link>
        </div>
      </section>
    </main>
  );
}
