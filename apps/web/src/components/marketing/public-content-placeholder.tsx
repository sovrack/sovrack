import Link from "next/link";
import { MarketingNavbar } from "./marketing-navbar";
import MarketingFooter from "./marketing-footer";

type PublicContentPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  showRegister?: boolean;
};

export function PublicContentPlaceholder({
  eyebrow,
  title,
  description,
  showRegister = false,
}: PublicContentPlaceholderProps) {
  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />

      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl items-center px-6 py-20">
        <section className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl sm:p-14">
          <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            {eyebrow}
          </span>
          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
            {description}
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            Cette page est volontairement neutralisée pendant la validation du
            produit. Son ancien contenu ne constitue ni une offre commerciale,
            ni un engagement de service, ni une documentation contractuelle.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/login"
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-400"
            >
              Accès aux tests
            </Link>
            {showRegister && (
              <Link
                href="/register"
                className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Créer un compte de test
              </Link>
            )}
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
