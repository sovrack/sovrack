"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/api/use-auth";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

const features = [
  {
    title: "Toutes vos technologies",
    desc: "Sites statiques, APIs, backends, bases de données et services Docker — quel que soit votre framework.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M3 7c0 2.21 3.582 4 8 4s8-1.79 8-4M3 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
    ),
  },
  {
    title: "Intégration Git",
    desc: "Connectez GitHub ou GitLab : chaque push déclenche un déploiement automatique.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l-3 3 3 3m5 0l3-3-3-3m-2-5l-4 14" /></svg>
    ),
  },
  {
    title: "Vos serveurs, votre contrôle",
    desc: "Connectez vos propres serveurs par SSH ou laissez Sovrack provisionner l'infrastructure gérée.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    ),
  },
  {
    title: "SSL automatique",
    desc: "Certificats HTTPS générés et renouvelés automatiquement pour vos domaines.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    ),
  },
  {
    title: "Environnements multiples",
    desc: "Déployez en production, staging ou preview par pull request, avec des variables par environnement.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
    ),
  },
  {
    title: "Monitoring 24/7",
    desc: "Disponibilité, serveur et disque surveillés en continu, alertes immédiates en cas de problème.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    ),
  },
];

const steps = [
  { step: "01", title: "Créez votre compte", desc: "Inscrivez-vous avec votre email et connectez-vous immédiatement." },
  { step: "02", title: "Connectez votre dépôt", desc: "Ajoutez votre projet et votre serveur (ou choisissez un serveur managé) en quelques clics." },
  { step: "03", title: "Déployez en un clic", desc: "Chaque push Git déclenche un déploiement automatique, SSL et monitoring inclus." },
];

const faq = [
  {
    q: "Quel niveau technique faut-il ?",
    a: "Aucun. Connectez votre dépôt Git, choisissez votre offre : Sovrack provisionne, déploie et surveille votre application automatiquement.",
  },
  {
    q: "Où tourne mon application ?",
    a: "Sur vos propres serveurs (que vous gérez vous-même) ou sur l'infrastructure managée Sovrack — avec base de données, Redis et accès administrateur inclus.",
  },
  {
    q: "Puis-je utiliser mon propre domaine ?",
    a: "Oui. Chaque application reçoit un sous-domaine HTTPS automatique (SSL inclus). Un domaine personnalisé est disponible sur les plans payants.",
  },
  {
    q: "Que se passe-t-il si mon application tombe ?",
    a: "Le monitoring surveille vos applications 24h/24. En cas de problème, vous êtes alerté immédiatement et l'état est visible sur la page de statut publique.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <MarketingNavbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pb-24 pt-24">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50 via-white to-indigo-50" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(37,99,235,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          }}
        />
        <div className="absolute top-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute top-24 right-0 -mr-24 h-96 w-96 rounded-full bg-indigo-100/60 blur-3xl" />
        <div className="absolute bottom-0 left-0 -ml-24 h-96 w-96 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-4 py-1.5 text-xs font-semibold text-blue-700 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
            Nouveau — Déploiement automatisé en 2 minutes
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Déployez vos applications{" "}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              en un clic
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Sites web, APIs, bases de données et services Docker — déployez sur
            vos serveurs ou sur l&apos;infrastructure managée Sovrack, sans
            aucune configuration.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/login"
              className="rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              Commencer gratuitement
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Voir la documentation
            </Link>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-10 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Sans carte bancaire
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Prêt en 2 minutes
            </span>
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Support en français
            </span>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-slate-100 bg-slate-50/50 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 gap-12 text-center md:grid-cols-4">
            {[
              { value: "2 min", label: "de déploiement" },
              { value: "99,9%", label: "de disponibilité" },
              { value: "24/7", label: "de monitoring" },
              { value: "100%", label: "des étapes automatisées" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-4xl font-bold text-blue-600">{s.value}</div>
                <div className="mt-1 text-sm text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── La plateforme ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold">
            Une plateforme de déploiement complète
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-500">
            Tout pour déployer, sécuriser et surveiller vos applications, sans
            administrer de serveur.
          </p>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-slate-100 bg-white p-8 transition hover:border-blue-100 hover:shadow-lg hover:shadow-blue-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-600 group-hover:text-white">
                  {f.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="border-y border-slate-100 bg-slate-50/50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold">Comment ça marche</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-500">
            3 étapes pour déployer votre première application.
          </p>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {steps.map((h) => (
              <div key={h.step} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white shadow-lg shadow-blue-200">
                  {h.step}
                </div>
                <h3 className="mt-6 text-lg font-semibold">{h.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {h.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold">
            Questions fréquentes
          </h2>
          <div className="mt-12 space-y-4">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-slate-100 bg-white p-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {item.q}
                  <svg
                    className="h-5 w-5 text-slate-400 transition group-open:rotate-180"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Prêt à déployer en un clic ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500">
            Créez votre compte gratuitement et déployez votre première
            application en moins de 2 minutes.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="rounded-xl bg-blue-600 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
            >
              Commencer gratuitement
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
