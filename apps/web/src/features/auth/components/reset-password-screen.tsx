"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { AuthLayout } from "./auth-layout";
import { PasswordInput } from "@/shared/ui/password-input";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import {
  SOVRACK_PASSWORD_MAX_LENGTH,
  SOVRACK_PASSWORD_MESSAGE,
  SOVRACK_PASSWORD_MIN_LENGTH,
  isSovrackPassword,
} from "@/shared/lib/password-policy";

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
    if (!isSovrackPassword(password)) {
      setError(SOVRACK_PASSWORD_MESSAGE);
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
    <AuthLayout headerAction={{ label: "Se connecter", href: "/login" }}>
      <div className="w-full">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Nouveau mot de passe
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Entrez le code reçu et définissez votre nouveau mot de passe.
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {done ? (
          <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <h2 className="mt-3 text-base font-semibold text-emerald-300">
              Mot de passe réinitialisé !
            </h2>
            <p className="mt-2 text-xs text-emerald-200/80">
              Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-4 w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              Se connecter
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
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
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 transition focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label
                htmlFor="code"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
              >
                Code reçu par email
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.trim())}
                placeholder="123456"
                required
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 font-mono text-sm text-white placeholder:text-zinc-500 transition focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
              >
                Nouveau mot de passe
              </label>
              <div className="mt-1.5">
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="12 caractères minimum"
                  autoComplete="new-password"
                  required
                  minLength={SOVRACK_PASSWORD_MIN_LENGTH}
                  maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
                  className="rounded-lg border-zinc-800 bg-zinc-900/80 focus:border-zinc-500 focus:ring-zinc-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-medium uppercase tracking-wider text-zinc-400"
              >
                Confirmer le mot de passe
              </label>
              <div className="mt-1.5">
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmez le mot de passe"
                  autoComplete="new-password"
                  required
                  className="rounded-lg border-zinc-800 bg-zinc-900/80 focus:border-zinc-500 focus:ring-zinc-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 shadow-sm disabled:opacity-50"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Mettre à jour le mot de passe
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-zinc-400">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 font-medium text-white transition hover:underline"
          >
            <ArrowLeft size={13} /> Retour à la connexion
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
