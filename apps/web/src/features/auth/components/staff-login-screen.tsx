"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStaffStore } from "@/stores/staff.store";
import { getApiErrorMessage } from "@/shared/lib/api";
import { ShieldCheck } from "lucide-react";
import { SovrackBrand } from "@/shared/ui/sovrack-logo";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

export function StaffLoginScreen() {
  const router = useRouter();
  const login = useStaffStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password, mfaCode || undefined);
      if (result === "MFA_REQUIRED") {
        setMfaRequired(true);
        setLoading(false);
        return;
      }
      router.replace(
        result === "ENROLLMENT_REQUIRED"
          ? "/staff/settings/security"
          : "/staff",
      );
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          "Identifiants incorrects. Veuillez réessayer.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app text-primary">
      <header className="border-b border-border bg-app/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
          <Link href={publicSitePath("/")} className="flex items-center">
            <SovrackBrand logoClassName="h-7 w-7 text-primary" textClassName="text-primary" />
          </Link>
        </div>
      </header>

      <section className="mx-auto flex max-w-md items-center px-6 pb-24 pt-20">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-primary">Back-office</h1>
              <p className="text-sm text-secondary">Équipe de la plateforme</p>
            </div>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-secondary">
            Accès réservé à l&apos;équipe d&apos;administration : gestion des
            comptes clients, des équipes et des abonnements.
          </p>

          {error && (
            <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-secondary"
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
                disabled={mfaRequired}
                className="mt-1.5 w-full rounded-lg border border-border bg-hover/10 px-4 py-2.5 text-sm text-primary transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <div className="mt-2 text-right">
                <Link
                  href="/staff/forgot-password"
                  className="text-xs font-semibold text-accent hover:text-accent"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-secondary"
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
                disabled={mfaRequired}
                className="mt-1.5 w-full rounded-lg border border-border bg-hover/10 px-4 py-2.5 text-sm text-primary transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            {mfaRequired && (
              <div>
                <label
                  htmlFor="mfa-code"
                  className="block text-sm font-medium text-secondary"
                >
                  Code de sécurité
                </label>
                <input
                  id="mfa-code"
                  value={mfaCode}
                  onChange={(event) =>
                    setMfaCode(event.target.value.toUpperCase())
                  }
                  placeholder="123456 ou code de secours"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-border bg-hover/10 px-4 py-2.5 text-sm tracking-widest text-primary transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMfaRequired(false);
                    setMfaCode("");
                    setError("");
                  }}
                  className="mt-2 text-xs font-semibold text-secondary hover:text-primary"
                >
                  Utiliser un autre compte
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover   disabled:opacity-50"
            >
              {loading
                ? "Vérification..."
                : mfaRequired
                  ? "Vérifier le second facteur"
                  : "Accéder au back-office"}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-muted">
            Espace client ?{" "}
            <Link
              href={customerAppPath("/login")}
              className="font-semibold text-secondary hover:text-primary"
            >
              Se connecter à la plateforme
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
