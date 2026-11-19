"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  SOVRACK_PASSWORD_MAX_LENGTH,
  SOVRACK_PASSWORD_MESSAGE,
  SOVRACK_PASSWORD_MIN_LENGTH,
  isSovrackPassword,
} from "@/shared/lib/password-policy";

export default function StaffActivationPage() {
  return (
    <Suspense fallback={null}>
      <StaffActivationForm />
    </Suspense>
  );
}

function StaffActivationForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);
  const [codeRequested, setCodeRequested] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (code.length !== 8) {
      setError("Le code doit contenir exactement 8 chiffres.");
      return;
    }
    if (!isSovrackPassword(password)) {
      setError(SOVRACK_PASSWORD_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    try {
      await staffService.acceptStaffInvitation(email, code, password);
      setActivated(true);
      window.history.replaceState(null, "", "/staff/activate");
    } catch (activationError) {
      setError(getApiErrorMessage(activationError));
    } finally {
      setSubmitting(false);
    }
  };

  const requestCode = async () => {
    setError("");
    if (!email.trim()) {
      setError("Saisissez votre adresse email Staff.");
      return;
    }
    setSubmitting(true);
    try {
      await staffService.requestActivationCode(email);
      setCodeRequested(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ShieldCheck size={20} />
          </span>
          <div>
            <p className="font-bold text-white">Sovrack</p>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Activation back-office
            </p>
          </div>
        </div>

        {activated ? (
          <div>
            <CheckCircle2 className="mb-4 text-green-400" size={34} />
            <h1 className="text-xl font-bold text-white">Compte activé</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Le code est maintenant consommé. Vous pouvez vous connecter avec
              votre nouveau mot de passe.
            </p>
            <Link
              href="/staff/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950"
            >
              Se connecter au back-office
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-white">
                Choisir votre mot de passe
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Saisissez le code à 8 chiffres reçu par email, puis choisissez
                votre premier mot de passe. Le code expire après 10 minutes.
              </p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Email Staff
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Code d’activation
              </span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                required
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-center text-lg tracking-[0.35em] outline-none focus:border-blue-500"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Nouveau mot de passe
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={SOVRACK_PASSWORD_MIN_LENGTH}
                maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                Confirmer le mot de passe
              </span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm outline-none focus:border-blue-500"
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting || code.length !== 8}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <KeyRound size={16} />
              {submitting ? "Activation…" : "Activer mon compte"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void requestCode()}
              className="w-full text-sm font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40"
            >
              {codeRequested
                ? "Code demandé — vérifiez votre email"
                : "Demander un nouveau code"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
