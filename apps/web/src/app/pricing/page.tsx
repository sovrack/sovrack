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

  const targetHref = isAuthenticated ? "/settings/billing" : "/login";

  return (
    <div className="min-h-screen bg-white">
      <MarketingNavbar />

      <section className="pb-20 pt-24">
        <div className="mx-auto max-w-7xl px-6">
          <h1 className="text-center text-4xl font-bold">
            Des tarifs simples et transparents
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-500">
            Commencez gratuitement. Évoluez à votre rythme. Pas de frais cachés.
          </p>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border p-8 ${
                  p.featured
                    ? "border-blue-200 bg-white shadow-xl shadow-blue-100 ring-2 ring-blue-500"
                    : "border-slate-200 bg-white"
                }`}
              >
                {p.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                    Recommandé
                  </span>
                )}
                <h2 className="text-xl font-bold">{p.name}</h2>
                <div className="mt-3">
                  <span className="text-4xl font-bold">{p.price}</span>
                  <span className="text-slate-400">/mois</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{p.desc}</p>
                <ul className="mt-8 space-y-3">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      <svg
                        className="h-4 w-4 shrink-0 text-green-500"
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
                <Link
                  href={targetHref}
                  className={`mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition ${
                    p.featured
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {p.cta}
                </Link>
                <p className="mt-3 text-center text-xs text-slate-400">
                  Abonnement mensuel, sans engagement. Paiement en ligne
                  disponible depuis votre espace.
                </p>
              </div>
            ))}
          </div>

          <div className="mt-20 rounded-2xl border border-slate-200 bg-slate-50/50 p-12 text-center">
            <h2 className="text-2xl font-bold">
              Vous avez des besoins spécifiques ?
            </h2>
            <p className="mt-2 text-slate-500">
              Plan Enterprise avec déploiement dédié, SLA personnalisé, support
              technique 24/7.
            </p>
            <a
              href="mailto:support@sovrack.tn?subject=Demande%20Enterprise"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
            >
              Nous contacter
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
