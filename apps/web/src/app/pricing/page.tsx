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
            "Tout ce qui est inclus dans le plan Pro",
            "Membres d'équipe illimités",
            "Contrôle d'accès granulaire par rôle (RBAC)",
            "Journaux d'audit de sécurité immuables",
            "Gestion multi-organisations",
            "Domaines personnalisés avancés",
            "Assistance d'intégration dédiée",
          ],
    },
  ];

  return (
    <div className="min-h-screen bg-app text-primary">
      <MarketingNavbar />

      <main className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">
            {isEn ? "Flexible Pricing" : "Tarification"}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-6xl">
            {isEn ? "Predictable plans for modern deployments." : "Des tarifs transparents pour vos déploiements."}
          </h1>
          <p className="mt-5 text-lg leading-8 text-secondary">
            {isEn
              ? "Start free on your own server, then upgrade as your infrastructure scales. Available worldwide and in Tunisia."
              : "Démarrez gratuitement sur votre serveur, puis faites évoluer selon vos besoins. Disponible à l'international et en Tunisie."}
          </p>

          {/* Currency Switcher */}
          <div className="mt-8 inline-flex items-center rounded-lg border border-border bg-card p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setCurrency("usd")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                currency === "usd"
                  ? "border border-accent/30 bg-hover/20 text-accent font-semibold"
                  : "text-secondary hover:text-primary"
              }`}
            >
              International ($ USD)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("tnd")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                currency === "tnd"
                  ? "border border-accent/30 bg-hover/20 text-accent font-semibold"
                  : "text-secondary hover:text-primary"
              }`}
            >
              Tunisie (Dinars TND)
            </button>
          </div>
        </div>

        {/* 3-Tier Grid */}
        <div className="mx-auto mt-16 grid max-w-7xl gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-lg border p-8 backdrop-blur-xl transition-all duration-200 ${
                plan.highlighted
                  ? "border-accent/50 bg-card ring-1 ring-accent/30"
                  : "border-border bg-card hover:border-border-hover"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-card px-3.5 py-1 text-xs font-semibold text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                    {plan.badge}
                  </span>
                </div>
              )}

              <div>
                <h3 className="text-2xl font-bold text-primary">{plan.name}</h3>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  {plan.description}
                </p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold tracking-tight text-primary">
                    {plan.price}
                  </span>
                  <span className="text-sm font-medium text-secondary">
                    {plan.period}
                  </span>
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-secondary">
                    {isEn ? "What's included" : "Fonctionnalités incluses"}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-primary">
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <Link
                  href={plan.ctaHref}
                  className={`inline-flex w-full items-center justify-center rounded-lg px-5 py-3.5 text-center text-sm font-semibold transition-all ${
                    plan.highlighted
                      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                      : "border border-border bg-hover/10 text-primary hover:bg-hover/15"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* On-Premise / Enterprise Callout */}
        <section className="mx-auto mt-16 max-w-4xl rounded-lg border border-border bg-card p-8 text-center sm:p-10">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl font-bold text-primary">
            {isEn ? "Sovrack Enterprise (On-Premise)" : "Sovrack Entreprise (On-Premise)"}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-secondary">
            {isEn
              ? "Need full data sovereignty, strict air-gapped isolation, SAML SSO, or custom SLA contracts? We offer an audited, self-hosted Enterprise edition licensed for corporate networks."
              : "Besoin d'une souveraineté totale de vos données, d'un réseau interne isolé (air-gapped), du SSO SAML ou d'un contrat de support SLA ? Nous proposons une édition Entreprise sous licence dédiée pour vos serveurs internes."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:contact@sovrack.com?subject=Demande%20Sovrack%20Entreprise"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover"
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

