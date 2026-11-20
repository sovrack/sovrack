"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { staffService } from "@/features/staff/api/staff.service";
import { customerAppPath } from "@/shared/config/product-urls";
import { getApiErrorMessage } from "@/shared/lib/api";

export default function StaffSessionExchangePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      setError("L’autorisation d’assistance est absente.");
      return;
    }

    void staffService
      .exchangeImpersonation(token)
      .then(() => window.location.replace(customerAppPath("/dashboard")))
      .catch((exchangeError: unknown) =>
        setError(getApiErrorMessage(exchangeError)),
      );
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-6 text-primary">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
        {error ? (
          <>
            <ShieldCheck className="mx-auto text-amber-500" size={34} />
            <h1 className="mt-5 text-xl font-semibold">Session non ouverte</h1>
            <p className="mt-3 text-sm text-secondary">{error}</p>
            <Link
              href={customerAppPath("/login")}
              className="mt-6 inline-flex rounded-lg bg-accent px-4 py-2.5 font-semibold text-accent-foreground"
            >
              Revenir à la connexion
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto animate-spin text-accent" size={34} />
            <h1 className="mt-5 text-xl font-semibold">
              Ouverture de la session d’assistance
            </h1>
            <p className="mt-3 text-sm text-secondary">
              L’autorisation à usage unique est en cours de vérification.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
