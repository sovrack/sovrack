"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Sparkles, ShieldCheck } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { customerAppPath } from "@/shared/config/product-urls";
import { useI18n } from "@/shared/i18n/language-context";

export default function PricingPage() {
  const { lang } = useI18n();
  const [currency, setCurrency] = useState<"usd" | "tnd">("usd");
  const isEn = lang === "en";

  const plans = [
    {
      id: "free",
      name: isEn ? "Free (Hobby)" : "Gratuit (Hobby)",
      description: isEn
        ? "Ideal for individuals starting their self-hosted journey."
        : "Idéal pour découvrir Sovrack et déployer un premier projet.",
      price: currency === "usd" ? "0 $" : "0 DT",
      period: isEn ? "forever free" : "gratuit à vie",
      highlighted: false,
      cta: isEn ? "Start Free" : "Commencer gratuitement",
      ctaHref: customerAppPath("/register"),
      features: isEn
        ? [
            "1 Server connection",
            "1 Project & Environment",
            "Personal or Organization space (up to 3 members)",
            "Docker & Nixpacks auto-builds",
            "In-browser interactive SSH Terminal",
            "Automatic Let's Encrypt HTTPS",
            "Postgres, Redis, MySQL, Mongo containers",
          ]
        : [
            "1 Serveur connecté",
            "1 Projet & Environnement",
            "Espace personnel ou organisation (3 membres)",
            "Builds automatiques Docker & Nixpacks",
            "Terminal SSH interactif dans le navigateur",
            "Certificats SSL HTTPS automatiques",
            "Bases PostgreSQL, Redis, MySQL, MongoDB",
          ],
    },
    {
      id: "pro",
      name: isEn ? "Pro" : "Plan Pro",
      description: isEn
        ? "For developers and freelancers managing multiple client servers."
        : "Pour les développeurs et freelances gérant plusieurs serveurs et projets.",
      price: currency === "usd" ? "15 $" : "45 DT",
      period: isEn ? "/ month" : "/ mois",
      highlighted: true,
      badge: isEn ? "Most Popular" : "Plus populaire",
      cta: isEn ? "Upgrade to Pro" : "Choisir le plan Pro",
      ctaHref: customerAppPath("/register"),
      features: isEn
        ? [
            "Unlimited Servers & Fleets",
            "Unlimited Projects & Services",
            "Auto-deploy on Git push (Webhooks)",
            "Automated remote backups & retention",
            "Real-time resource metrics & alerts",
            "Fast build queues & Redis pub/sub logs",
            "Priority community support",
          ]
        : [
            "Serveurs & parcs illimités",
            "Projets & Services illimités",
            "Déploiements auto sur Git push (Webhooks)",
            "Sauvegardes automatiques & rétention",
            "Métriques et alertes en temps réel",
            "Files de build rapides & logs en streaming",
            "Support prioritaire",
          ],
    },
    {
      id: "team",
      name: isEn ? "Team" : "Plan Team",
      description: isEn
        ? "For teams collaborating across infrastructure fleets."
        : "Pour les agences et équipes collaborant sur une infrastructure partagée.",
      price: currency === "usd" ? "49 $" : "150 DT",
      period: isEn ? "/ month" : "/ mois",
      highlighted: false,
      cta: isEn ? "Get Team" : "Choisir le plan Team",
      ctaHref: customerAppPath("/register"),
      features: isEn
        ? [
            "Everything in Pro",
            "Unlimited team members",
            "Granular Role-Based Access Control (RBAC)",
            "Immutable audit logs & compliance trail",
            "Multi-organization switching",
            "Custom domain branding",
            "Dedicated onboarding & setup assistance",
          ]
        : [
            "Tout ce qui est inclus dans Pro",
            "Membres d'équipe illimités",
            "Gestion granulaire des rôles (RBAC)",
            "Piste d'audit infalsifiable",
            "Multi-organisations illimitées",
            "Domaines personnalisés",
            "Assistance à l'intégration dédiée",
          ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-primary selection:bg-[#2563EB] selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-[1280px] px-6 sm:px-12 lg:px-24 py-12 sm:py-16">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
            {isEn ? "Flexible Pricing" : "Tarification"}
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-normal tracking-tight text-white">
            {isEn ? "Predictable plans for modern deployments." : "Des tarifs transparents pour vos déploiements."}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {isEn
              ? "Start free on your own server, then upgrade as your infrastructure scales. Available worldwide and in Tunisia."
              : "Démarrez gratuitement sur votre serveur, puis faites évoluer selon vos besoins. Disponible à l'international et en Tunisie."}
          </p>

          {/* Currency Switcher */}
          <div className="mt-6 inline-flex items-center rounded-lg bg-[#121212] p-1">
            <button
              type="button"
              onClick={() => setCurrency("usd")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                currency === "usd"
                  ? "bg-[#2563EB] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              International ($ USD)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("tnd")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                currency === "tnd"
                  ? "bg-[#2563EB] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Tunisie (Dinars TND)
            </button>
          </div>
        </div>

        {/* 3-Tier Grid */}
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-xl bg-[#121212] p-6 transition-all duration-200 ${
                plan.highlighted ? "ring-1 ring-[#2563EB]" : "hover:bg-[#151515]"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2563EB] px-3 py-0.5 text-[10px] font-medium text-white">
                    <Sparkles className="h-3 w-3" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-lg font-medium text-white">{plan.name}</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {plan.description}
                </p>

                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-3xl font-medium tracking-tight text-white">
                    {plan.price}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {plan.period}
                  </span>
                </div>

                <div className="mt-6 border-t border-zinc-800/40 pt-5">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                    {isEn ? "What's included" : "Fonctionnalités incluses"}
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-xs text-zinc-300">
                        <CheckCircle2
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2563EB]"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 pt-2">
                <Link
                  href={plan.ctaHref}
                  className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-xs font-medium transition-colors ${
                    plan.highlighted
                      ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
                      : "bg-[#161616] text-zinc-300 hover:text-white hover:bg-[#202020]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Enterprise Callout */}
        <section className="mt-14 rounded-2xl bg-[#121212] p-8 text-center sm:p-10">
          <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-xl font-normal text-white">
            {isEn ? "Sovrack Enterprise (On-Premise)" : "Sovrack Entreprise (On-Premise)"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs text-zinc-400 leading-relaxed">
            {isEn
              ? "Need full data sovereignty, strict air-gapped isolation, SAML SSO, or custom SLA contracts? We offer an audited, self-hosted Enterprise edition licensed for corporate networks."
              : "Besoin d'une souveraineté totale de vos données, d'un réseau interne isolé (air-gapped), du SSO SAML ou d'un contrat de support SLA ? Nous proposons une édition Entreprise sous licence dédiée pour vos serveurs internes."}
          </p>
          <div className="mt-5 flex justify-center">
            <a
              href="mailto:contact@sovrack.com?subject=Demande%20Sovrack%20Entreprise"
              className="inline-flex items-center justify-center rounded-md bg-[#2563EB] px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1d4ed8]"
            >
              {isEn ? "Contact Enterprise Sales" : "Contacter l'équipe Entreprise"}
            </a>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
