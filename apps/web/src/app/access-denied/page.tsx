import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="surface-card fade-up w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
        <p className="mono text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">
          403
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">
          Accès refusé
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Vous n&apos;avez pas la permission d&apos;accéder à cette section. Contactez un
          administrateur si nécessaire.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-medium text-[var(--bg-app)] hover:opacity-90"
          >
            Retour au tableau de bord
          </Link>
          <Link
            href="/settings"
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)]"
          >
            Ouvrir les paramètres
          </Link>
        </div>
      </section>
    </main>
  );
}