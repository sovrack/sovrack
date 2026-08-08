"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/api/use-auth";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

const plans = [
  {
    name: "Free",
    price: "0 DT",
    desc: "Pour découvrir la plateforme",
    features: [
      "1 projet",
      "1 serveur",
      "3 membres d'équipe",
      "Monitoring 24/7",
      "SSL automatique",
      "Support par email",
    ],
    cta: "Démarrer gratuitement",
    featured: false,
  },
  {
    name: "Starter",
    price: "99 DT",
    desc: "Pour les équipes en croissance",
    features: [
      "Tout le plan Free",
      "3 projets",
      "2 serveurs",
      "10 membres d'équipe",
      "Déploiements Git automatiques",
      "Support prioritaire",
    ],
    cta: "Choisir Starter",
    featured: true,
  },
  {
    name: "Pro",
    price: "299 DT",
    desc: "Pour les entreprises",
    features: [
      "Tout le plan Starter",
      "10 projets",
      "5 serveurs",
      "25 membres d'équipe",
      "Infrastructure managée",
      "Support dédié",
    ],
    cta: "Choisir Pro",
    featured: false,
  },
  {
    name: "Enterprise",
    price: "990 DT",
    desc: "Pour les grandes organisations",
    features: [
      "Tout le plan Pro",
      "100 projets",
      "100 serveurs",
      "500 membres d'équipe",
      "SLA personnalisé",
      "Support dédié 24/7",
    ],
    cta: "Nous contacter",
    featured: false,
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      router.replace("/settings/billing");
    }
  }, [isAuthenticated, loading, router]);

  const targetHref = isAuthenticated ? "/settings/billing" : "/register";

  return (
    <div className="min-h-screen bg-brand">
      <MarketingNavbar />

      <section className="pb-20 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <h1 className="text-center text-4xl font-bold text-white">
            Des tarifs simples et transparents
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            Commencez gratuitement. Évoluez à votre rythme. Pas de frais cachés.
          </p>

          <div className="mt-16 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border p-8 ${
                  p.featured
                    ? "border-sky-400/40 bg-brand-light shadow-xl shadow-sky-500/10 ring-2 ring-sky-400/60"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                    Recommandé
                  </span>
                )}
                <h2 className="text-xl font-bold text-white">{p.name}</h2>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-white">{p.price}</span>
                  <span className="text-slate-400">/mois</span>
                </div>
                <p className="mt-1 text-sm text-slate-400">{p.desc}</p>
                <ul className="mt-8 space-y-3">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <svg
                        className="h-4 w-4 shrink-0 text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                {p.name === "Enterprise" ? (
                  <a
                    href="mailto:support@sovrack.tech?subject=Demande%20Enterprise"
                    className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${
                      p.featured
                        ? "bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/25 hover:brightness-110"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {p.cta}
                  </a>
                ) : (
                  <Link
                    href={targetHref}
                    className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${
                      p.featured
                        ? "bg-gradient-to-r from-sky-500 to-violet-500 text-white shadow-lg shadow-sky-500/25 hover:brightness-110"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {p.cta}
                  </Link>
                )}
                <p className="mt-3 text-center text-xs text-slate-500">
                  Abonnement mensuel, sans engagement. Paiement en ligne
                  disponible depuis votre espace.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
