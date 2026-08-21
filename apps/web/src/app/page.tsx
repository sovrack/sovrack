"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/api/use-auth";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { SovrackLogo } from "@/components/marketing/sovrack-logo";
import { PublicContentPlaceholder } from "@/components/marketing/public-content-placeholder";
import { isCapabilityEnabled } from "@/shared/config/product-capabilities";

const features = [
  {
    title: "Toutes vos technologies",
    desc: "Sites statiques, APIs, backends, bases de données et services Docker — quel que soit votre framework.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M3 7c0 2.21 3.582 4 8 4s8-1.79 8-4M3 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
        />
      </svg>
    ),
  },
  {
    title: "Intégration Git",
    desc: "Connectez GitHub ou GitLab : chaque push déclenche un déploiement automatique.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 9l-3 3 3 3m5 0l3-3-3-3m-2-5l-4 14"
        />
      </svg>
    ),
  },
  {
    title: "Vos serveurs, votre contrôle",
    desc: "Connectez vos propres serveurs par SSH ou laissez Sovrack provisionner l'infrastructure gérée.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  },
  {
    title: "SSL automatique",
    desc: "Certificats HTTPS générés et renouvelés automatiquement pour vos domaines.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "Environnements multiples",
    desc: "Déployez en production, staging ou preview par pull request, avec des variables par environnement.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
  {
    title: "Monitoring 24/7",
    desc: "Disponibilité, serveur et disque surveillés en continu, alertes immédiates en cas de problème.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  },
];

const steps = [
  {
    step: "01",
    title: "Créez votre compte",
    desc: "Inscrivez-vous avec votre email et connectez-vous immédiatement.",
  },
  {
    step: "02",
    title: "Connectez votre dépôt",
    desc: "Ajoutez votre projet et votre serveur (ou choisissez un serveur managé) en quelques clics.",
  },
  {
    step: "03",
    title: "Déployez en un clic",
    desc: "Chaque push Git déclenche un déploiement automatique, SSL et monitoring inclus.",
  },
];

const extendedFeatures = [
  {
    title: "Tous les langages",
    icon: "M13 12h8M6 12h1M9 12h1M13 12l4 4M13 12l4-4M4 17a4 4 0 10.01 0M12 5a4 4 0 10-6-1M16 3a4 4 0 10-1 6",
    desc: "Compatible avec un large éventail de langages et de frameworks : sites statiques, APIs, backends, bases de données, services et plus encore.",
  },
  {
    title: "N'importe quel serveur",
    icon: "M2 12h20M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2zM12 6v12M7 9h.01M16 15h.01M10 15h2",
    desc: "Déployez sur vos propres serveurs : VPS, Raspberry Pi, EC2, DigitalOcean, Linode, Hetzner… Il suffit d'une connexion SSH.",
  },
  {
    title: "Tous les cas d'usage",
    icon: "M8 2v4a2 2 0 01-2 2H2M16 2v4a2 2 0 002 2h4M8 22v-4a2 2 0 01-2-2H2M16 22v-4a2 2 0 012-2h4M12 8a4 4 0 100 8 4 4 0 000-8z",
    desc: "Déployez vos ressources sur un seul serveur ou sur plusieurs, selon vos besoins et votre organisation.",
  },
  {
    title: "N'importe quel service",
    icon: "M12 2v8m0 0l-3-3m3 3l3-3M4 22v-6a2 2 0 012-2h12a2 2 0 012 2v6M12 14v8M8 22h8",
    desc: "Déployez n'importe quel service compatible Docker, avec de nombreux services en un clic prêts à l'emploi.",
  },
  {
    title: "Push to deploy",
    icon: "M5 12h14M13 6l6 6-6 6M12 2a10 10 0 10.01 0",
    desc: "Intégration Git native : chaque push déclenche un déploiement automatique, en quelques secondes.",
  },
  {
    title: "Certificats SSL gratuits",
    icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM12 15v4M3.6 8.5a9 9 0 1116.8 0M5 20h14",
    desc: "Let's Encrypt s'occupe de générer et renouveler automatiquement vos certificats HTTPS. Vous n'avez rien à faire.",
  },
  {
    title: "Zéro vendor lock-in",
    icon: "M12 9V2m0 7a6 6 0 110 12l0 0a6 6 0 010-12zM9 3H3v6h6M15 21h6v-6M21 3l-9 9",
    desc: "Vos données vous appartiennent : tous les réglages sont stockés sur vos propres serveurs, vous gardez la main.",
  },
  {
    title: "Sauvegardes automatiques",
    icon: "M6 7h12M6 7c0-2-1-3-3-3h15v14M18 7l4 4-4 4M18 11h6v4h-6M4 21l4-4",
    desc: "Sauvegardes chiffrées et exportables de vos bases de données, automatisées depuis la plateforme.",
  },
  {
    title: "Webhooks",
    icon: "M3 3v18M18 3v18M3 12h12M3 5c3 2 5 2 7 0M3 17c3-2 5-2 7 0M14 9l-3-3M11 12l3-3",
    desc: "Intégrez vos pipelines CI/CD ou créez des automatisations avec GitHub Actions, GitLab CI et plus.",
  },
  {
    title: "API puissante",
    icon: "M6 9V2h6m-6 0l9 9 6-6M6 22v-4M6 18H2m4 0v-6h6v6H9M19 17a3 3 0 100 6 3 3 0 000-6zM19 8H9m10 0l-3 3m3-3l-3-3",
    desc: "Une API robuste pour automatiser les déploiements, gérer vos ressources et vous intégrer à vos outils.",
  },
  {
    title: "Terminal temps réel",
    icon: "M4 17l6-4-6-4M12 18h8M9 15l4 4M9 11l4-4",
    desc: "Gérez vos serveurs sans quitter le navigateur : terminal temps réel pour exécuter vos commandes.",
  },
  {
    title: "Collaboratif",
    icon: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    desc: "Partagez vos projets avec votre équipe et contrôlez finement les rôles et permissions de chacun.",
  },
  {
    title: "Déploiements PR",
    icon: "M7 9a3 3 0 100-6 3 3 0 000 6zM7 21a3 3 0 100-6 3 3 0 000 6zM7 6v12M15 16a3 3 0 104 0 3 3 0 00-4 0zM11 18h4",
    desc: "Déployez automatiquement chaque commit et pull request séparément pour valider plus vite.",
  },
  {
    title: "Automatisations serveur",
    icon: "M12 2l2.5 5 5.5.8-4 3.9.9 5.4L12 14.5 7.1 17 8 11.7 4 7.8 9.5 7zM18 18l1 2.5M18 20h2.5",
    desc: "Une fois le serveur connecté, une multitude de tâches sont gérées automatiquement. Vous codez, on s'occupe du reste.",
  },
  {
    title: "Monitoring",
    icon: "M3 13h4l3 3 4-8 3 4h4M3 20h18",
    desc: "Surveillance de vos déploiements, serveurs, usage disque et autres, avec alertes à chaque problème.",
  },
  {
    title: "Notifications",
    icon: "M18 8a6 6 0 100-12 6 6 0 000 12zm-6 0a6 6 0 106 6M22 12L16 9",
    desc: "Soyez notifié via vos canaux préférés — Slack et email — à chaque événement important.",
  },
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
      <div className="flex min-h-screen items-center justify-center bg-brand">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      </div>
    );
  }

  if (!isCapabilityEnabled("publicMarketingCopy")) {
    return (
      <PublicContentPlaceholder
        eyebrow="Développement privé"
        title="Sovrack est en cours de validation"
        description="La plateforme est actuellement utilisée uniquement pour le développement et des tests de déploiement contrôlés."
        showRegister
      />
    );
  }

  return (
    <div className="min-h-screen bg-brand text-white">
      <MarketingNavbar />

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pb-24 pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(125,211,252,0.18),transparent)]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(125,211,252,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(125,211,252,0.06) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            {/* Colonne texte */}
            <div className="text-left">
              <h1 className="mt-2 text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
                <span className="block">Déployez</span>
                <span className="block">vos applications</span>
                <span className="block bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
                  en un clic
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-300">
                Déployez vos sites, APIs, bases de données et services Docker
                sur vos serveurs, sans complexité. Sovrack orchestre chaque
                étape — du push Git au monitoring — pour que vous vous
                concentriez sur votre code.
              </p>
              <div className="mt-12 flex flex-wrap items-center gap-4">
                <Link
                  href="/register"
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110"
                >
                  Commencer gratuitement
                </Link>
                <Link
                  href="/docs"
                  className="rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
                >
                  Voir la documentation
                </Link>
              </div>
              <div className="mt-12 flex flex-wrap items-center gap-8 text-sm text-slate-400">
                <span className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-emerald-400"
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
                  Déploiement Git automatique
                </span>
                <span className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-emerald-400"
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
                  SSL inclus
                </span>
                <span className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5 text-emerald-400"
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
                  Monitoring 24/7
                </span>
              </div>
            </div>

            {/* Colonne logo en grand, posé au fond sans carte */}
            <div className="relative flex items-center justify-center">
              <div className="absolute h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-sky-400/25 to-cyan-500/25 blur-3xl" />
              <div className="relative animate-[float-in_0.6s_ease-out]">
                <div className="animate-[float_6s_ease-in-out_infinite]">
                  <SovrackLogo
                    size={410}
                    className="-rotate-6 drop-shadow-[0_0_45px_rgba(0,82,155,0.45)]"
                  />
                </div>
                {/* Trajectoire de la flèche — arc étendu vers le haut-droite */}
                <svg
                  className="pointer-events-none absolute -right-32 -top-16 w-80 text-sky-400/60"
                  fill="none"
                  viewBox="0 0 260 220"
                >
                  <path
                    d="M250 8 C 180 90, 120 95, 10 160"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                    className="animate-[dashmove_1.2s_linear_infinite]"
                  />
                  <path
                    d="M250 8 C 180 90, 120 95, 10 160"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeOpacity="0.12"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute -left-6 top-1/2 h-12 w-1.5 rounded-full bg-gradient-to-b from-sky-400 to-cyan-500 animate-pulse" />
                <span className="absolute -right-4 bottom-8 h-1.5 w-12 rounded-full bg-cyan-400/70 animate-pulse [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="bg-brand py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 gap-12 text-center md:grid-cols-4">
            {[
              { value: "2 min", label: "de déploiement" },
              { value: "99,9%", label: "de disponibilité" },
              { value: "24/7", label: "de monitoring" },
              { value: "100%", label: "des étapes automatisées" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-4xl font-bold text-sky-400">{s.value}</div>
                <div className="mt-1 text-sm text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── La plateforme ── */}
      <section id="platforme" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold text-white">
            Une plateforme de déploiement complète
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            Tout pour déployer, sécuriser et surveiller vos applications, sans
            administrer de serveur.
          </p>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-8 transition hover:border-sky-400/30 hover:bg-white/[0.06]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300 transition group-hover:bg-gradient-to-br group-hover:from-sky-500 group-hover:to-cyan-500 group-hover:text-white">
                  {f.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold text-white">
            Fonctionnalités
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            Tout ce dont vous avez besoin pour déployer, sécuriser et surveiller
            vos applications. Sans vous soucier de l&rsquo;infrastructure.
          </p>
          <div className="mt-16 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {extendedFeatures.map((f) => (
              <div key={f.title} className="flex gap-4">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-cyan-500/15 text-sky-300 ring-1 ring-white/10">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={f.icon}
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section id="how-it-works" className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold text-white">
            Comment ça marche
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            3 étapes pour déployer votre première application.
          </p>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {steps.map((h) => (
              <div key={h.step} className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-2xl font-bold text-white shadow-lg shadow-sky-500/25">
                  {h.step}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  {h.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {h.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Philosophie ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-3xl font-bold text-white">
            Notre philosophie
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            Un service simple, transparent, sans pièges.
          </p>
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {[
              {
                title: "La complexité ailleurs, la simplicité ici",
                desc: "Vous voulez déployer, pas administrer un serveur. Sovrack automatise tout le reste : provisionnement, SSL, sauvegardes, surveillance.",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                ),
              },
              {
                title: "Des prix clairs, sans surprise",
                desc: "Un abonnement mensuel, tout inclus : infrastructure, SSL, sauvegardes, monitoring. Vous savez ce que vous payez, chaque mois.",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                ),
              },
              {
                title: "Vos données vous appartiennent",
                desc: "Serveurs et instances isolés, sauvegardes exportables, aucune revente de données. Vous pouvez partir quand vous voulez.",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                ),
              },
              {
                title: "Amélioré en continu",
                desc: "Chaque retour utilisateur alimente nos prochaines versions. L'état du service est public sur notre page de statut.",
                icon: (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                ),
              },
            ].map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-8"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  {p.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Documentation ── */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-white">Documentation</h2>
              <p className="mt-4 max-w-lg text-slate-400">
                Tout est documenté, pas à pas : guide de démarrage, guides par
                technologie et référence API.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  "Guide de démarrage : créez votre compte et déployez en 2 minutes",
                  "Guides par technologie : Node.js, Next.js, Python, PHP, bases de données",
                  "Référence API et webhooks pour vos pipelines CI/CD",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-slate-300"
                  >
                    <svg
                      className="mt-0.5 h-5 w-5 shrink-0 text-sky-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/docs"
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110"
                >
                  Voir la documentation
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Commencer maintenant
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0a0a1a] p-6 font-mono text-sm shadow-xl">
              <div className="flex gap-1.5 pb-4">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <p className="text-slate-400">1. Connecter un serveur (SSH)</p>
              <p className="mt-2 text-slate-400">
                → Provisionnement Docker, SSL, réseau…
              </p>
              <p className="text-emerald-400">✓ Serveur prêt</p>
              <p className="text-slate-400">2. Choisir un dépôt et déployer</p>
              <p className="text-emerald-400">
                ✓ Monitoring et logs temps réel
              </p>
              <p className="mt-2 text-sky-400">
                ✓ En ligne : https://mon-app.sovrack.tech
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold text-white">
            Questions fréquentes
          </h2>
          <div className="mt-12 space-y-4">
            {faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
                  {item.q}
                  <svg
                    className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-45"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white">
            Prêt à déployer votre première application ?
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Créez votre compte gratuitement et déployez en 2 minutes. Sans carte
            bancaire. Sans engagement.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:brightness-110"
            >
              Créer mon compte gratuit
            </Link>
            <Link
              href="/pricing"
              className="rounded-xl border border-white/15 bg-white/5 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
            >
              Comparer les offres
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-slate-400">
            <span>SSL inclus</span>
            <span>Sans carte bancaire</span>
            <span>Prêt en 2 minutes</span>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
