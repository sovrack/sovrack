"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Copy,
  GitBranch,
  LockKeyhole,
  Server,
  ShieldCheck,
  Terminal,
  TerminalSquare,
  Users,
} from "lucide-react";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { useAuthStore } from "@/stores/auth.store";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

const capabilities = [
  {
    icon: Boxes,
    title: "Docker & Nixpacks",
    description:
      "Détection automatique de votre stack (Node, Go, Python, PHP, Rust, Dockerfile) et conteneurisation zéro friction.",
    badge: "Conteneurs",
  },
  {
    icon: Server,
    title: "Vos propres VPS par SSH",
    description:
      "Enregistrez n'importe quel serveur Ubuntu chez OVH, Hetzner, Scaleway ou en local. Aucun agent propriétaire lourd.",
    badge: "Infrastructure",
  },
  {
    icon: GitBranch,
    title: "GitHub & GitLab en 1 clic",
    description:
      "Connectez vos comptes Git via OAuth ou Personal Access Token (PAT). Déclenchez automatiquement vos déploiements sur push.",
    badge: "CI/CD",
  },
  {
    icon: ShieldCheck,
    title: "Domaines & HTTPS Let's Encrypt",
    description:
      "Routage Nginx dynamique avec génération et renouvellement automatique des certificats SSL/TLS pour chaque service.",
    badge: "Réseau",
  },
  {
    icon: TerminalSquare,
    title: "Terminal SSH dans le navigateur",
    description:
      "Accédez directement à la console de vos serveurs et inspectez vos conteneurs en direct sans quitter Sovrack.",
    badge: "Diagnostic",
  },
  {
    icon: Users,
    title: "Espaces personnels & Équipes",
    description:
      "Commencez seul dans votre espace personnel, puis créez des organisations pour collaborer avec gestion précise des rôles (RBAC).",
    badge: "Multi-tenant",
  },
];

const comparisons = [
  {
    feature: "Hébergement des données",
    sovrack: "Sur vos propres serveurs (souveraineté totale)",
    cloud: "Serveurs mutualisés propriétaires (lock-in)",
  },
  {
    feature: "Coût d'infrastructure",
    sovrack: "Coût fixe de votre VPS (ex. 5€/mois illimité)",
    cloud: "Facturation opaque à l'usage avec fortes marges",
  },
  {
    feature: "Accès système & Terminal",
    sovrack: "Accès SSH root complet sur votre serveur",
    cloud: "Sandbox restreinte sans accès machine",
  },
  {
    feature: "Limites de déploiement",
    sovrack: "Illimité, dicté uniquement par la RAM de votre VPS",
    cloud: "Quotas stricts de bande passante et CPU",
  },
];

const steps = [
  {
    num: "01",
    title: "Reliez votre serveur",
    desc: "Renseignez l'IP et la clé SSH de votre VPS Ubuntu. Sovrack valide les prérequis Docker en quelques secondes.",
  },
  {
    num: "02",
    title: "Sélectionnez votre dépôt",
    desc: "Choisissez votre projet GitHub ou GitLab, branchez vos variables d'environnement et vos domaines.",
  },
  {
    num: "03",
    title: "Déployez avec SSL",
    desc: "Validez la configuration. Sovrack build l'image Docker, configure Nginx et délivre le certificat HTTPS.",
  },
];

const faqs = [
  {
    q: "Où tournent mes applications déployées ?",
    a: "Exclusivement sur vos propres serveurs VPS. Sovrack pilote le déploiement par SSH sécurisé sans jamais héberger vos bases ni vos données sensibles.",
  },
  {
    q: "Quels types de projets puis-je déployer ?",
    a: "Tout projet avec un Dockerfile ou supporté par Nixpacks : Next.js, React, Node.js, Python, Go, PHP/Laravel, Rust, bases de données Postgres, Redis, MySQL, etc.",
  },
  {
    q: "Puis-je commencer gratuitement sans carte ?",
    a: "Oui. Vous pouvez connecter votre premier serveur local (VM) ou VPS et déployer vos applications sans renseigner aucune carte bancaire.",
  },
];

export default function LandingPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div className="min-h-screen bg-app text-primary selection:bg-accent selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* HERO SECTION — Inspiré du style épuré et compact de Supabase */}
        <section className="pt-12 pb-14 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24 border-b border-border/60">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Colonne gauche : Titre, sous-titre, CTA */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span>Plateforme de déploiement Open-Core</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400">v3.1</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-white leading-[1.14]">
                Déployez en un instant
                <span className="block text-accent font-normal mt-1">
                  Maîtrisez vos serveurs
                </span>
              </h1>

              <p className="text-sm sm:text-base text-zinc-400 font-normal leading-relaxed max-w-xl">
                La plateforme open-core pour orchestrer vos conteneurs Docker
                sur vos propres serveurs Ubuntu. Reliez vos dépôts Git, activez vos domaines HTTPS
                et pilotez vos releases en toute autonomie.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={customerAppPath(isAuthenticated ? "/dashboard" : "/register")}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover shadow-sm"
                >
                  {isAuthenticated ? "Accéder à mon espace" : "Commencer gratuitement"}
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href={publicSitePath("/docs")}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-4 text-[13px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
                >
                  Lire la documentation
                </Link>
              </div>

              <div className="flex items-center gap-6 pt-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-accent" />
                  Aucune carte bancaire requise
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-accent" />
                  100% sur vos propres VPS
                </span>
              </div>
            </div>

            {/* Colonne droite : Widget interactif minimaliste */}
            <div className="lg:col-span-5">
              <div className="rounded-lg border border-border/80 bg-zinc-950/80 p-4 shadow-theme-lg font-mono text-xs">
                {/* En-tête de terminal */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60 text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  </div>
                  <span className="text-[11px] text-zinc-400">sovrack release v3.1</span>
                  <Activity size={13} className="text-accent" />
                </div>

                {/* Corps de log temps réel */}
                <div className="space-y-2 text-[12px] leading-relaxed">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-accent">$</span>
                    <span className="text-zinc-200">sovrack deploy --target vps-production</span>
                  </div>
                  <p className="text-zinc-500 text-[11px]">→ Connexion SSH à 192.168.100.135:22... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Clone dépôt git@github.com:acme/api... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Détection Nixpacks (Node.js 22 LTS)... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Build conteneur Docker sha256:7b3a9e... OK</p>
                  <p className="text-emerald-400 text-[11px]">✓ Routage Nginx & HTTPS Let's Encrypt configurés</p>
                  <div className="mt-3 p-2 rounded bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
                    <span className="truncate">https://api.mondomaine.com</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-sans text-[10px]">En ligne</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION FONCTIONNALITÉS — Cartes compactes Supabase style */}
        <section className="py-14 sm:py-16 border-b border-border/60">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-accent">
                Fonctionnalités
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
                Tout ce qu&apos;il faut pour opérer vos services
              </h2>
            </div>
            <Link
              href={publicSitePath("/features")}
              className="text-xs text-accent hover:text-accent-hover transition-colors inline-flex items-center gap-1"
            >
              Voir toutes les fonctionnalités
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {capabilities.map(({ icon: Icon, title, description, badge }) => (
              <div
                key={title}
                className="group rounded-lg border border-border/70 bg-card/50 p-5 transition-all duration-200 hover:border-zinc-700 hover:bg-card/80"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent">
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    {badge}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-medium text-white">{title}</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION COMPARAISON — Open-Core vs Cloud propriétaire */}
        <section className="py-14 sm:py-16 border-b border-border/60">
          <div className="max-w-2xl mb-8">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Souveraineté & Coûts
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
              Reprenez le contrôle de votre infrastructure
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400">
              Ne payez plus de marges sur l&apos;usage de vos ressources cloud. Sovrack vous apporte la simplicité d&apos;un PaaS directement sur votre propre VPS.
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
            <div className="grid grid-cols-3 bg-zinc-950/70 p-3.5 text-xs font-medium text-zinc-400 border-b border-border/60">
              <span>Critère</span>
              <span className="text-accent font-semibold">Sovrack (Open-Core)</span>
              <span>Cloud Fermé / PaaS</span>
            </div>
            <div className="divide-y divide-border/40 text-xs">
              {comparisons.map((item) => (
                <div key={item.feature} className="grid grid-cols-3 p-3.5 items-center">
                  <span className="font-medium text-white">{item.feature}</span>
                  <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-accent shrink-0" />
                    {item.sovrack}
                  </span>
                  <span className="text-zinc-500">{item.cloud}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION PARCOURS EN 3 ÉTAPES */}
        <section className="py-14 sm:py-16 border-b border-border/60">
          <div className="text-center max-w-xl mx-auto mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              Flux simplifié
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
              Prêt en 3 étapes simples
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {steps.map((step) => (
              <div
                key={step.num}
                className="rounded-lg border border-border/70 bg-card/50 p-5 relative"
              >
                <span className="font-mono text-xs text-accent font-medium">
                  {step.num}
                </span>
                <h3 className="mt-2 text-sm font-medium text-white">{step.title}</h3>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION FAQ RAPIDE */}
        <section className="py-14 sm:py-16">
          <div className="max-w-xl mx-auto text-center mb-8">
            <h2 className="text-2xl font-normal tracking-tight text-white">
              Questions fréquentes
            </h2>
          </div>

          <div className="max-w-2xl mx-auto space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="rounded-lg border border-border/70 bg-card/40 p-4"
              >
                <h4 className="text-sm font-medium text-white">{faq.q}</h4>
                <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>

          {/* BANNIÈRE FINALE CTA */}
          <div className="mt-16 rounded-xl border border-border/80 bg-zinc-950/80 p-8 sm:p-10 text-center">
            <h3 className="text-xl sm:text-2xl font-normal text-white">
              Déployez votre premier projet dès aujourd&apos;hui
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              Rejoignez les développeurs qui gèrent leur infrastructure en toute liberté avec Sovrack.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href={customerAppPath(isAuthenticated ? "/dashboard" : "/register")}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-xs font-medium text-white transition-colors hover:bg-accent-hover shadow-sm"
              >
                {isAuthenticated ? "Accéder à mon espace" : "Créer mon compte"}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
