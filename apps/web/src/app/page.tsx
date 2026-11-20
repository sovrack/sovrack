"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";
import { BRAND_CONFIG } from "@/shared/config/brand.config";

function GitHubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

const capabilities = [
  {
    icon: Boxes,
    title: "Docker & Nixpacks",
    description:
      "Détection automatique de votre runtime (Node, Go, Python, PHP, Rust, Dockerfile) et conteneurisation zéro configuration.",
    badge: "Conteneurs",
  },
  {
    icon: Server,
    title: "Vos propres VPS par SSH",
    description:
      "Enregistrez n'importe quel serveur Ubuntu chez OVH, Hetzner, Scaleway ou en local. Aucun agent propriétaire résident.",
    badge: "Infrastructure",
  },
  {
    icon: GitBranch,
    title: "GitHub & GitLab en 1 clic",
    description:
      "Connectez vos comptes Git via OAuth ou Personal Access Token. Déclenchez automatiquement vos déploiements sur push.",
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
    a: "Exclusivement sur vos propres serveurs VPS. Sovrack pilote le déploiement par SSH sécurisé sans jamais héberger vos bases ni vos données sensibles. Vous conservez la pleine propriété de votre infrastructure.",
  },
  {
    q: "Quels types de projets puis-je déployer ?",
    a: "Tout projet avec un Dockerfile ou supporté par Nixpacks : Next.js, React, Node.js, Python, Go, PHP/Laravel, Rust, ainsi que les bases de données Postgres, Redis, MySQL, MongoDB en 1 clic.",
  },
  {
    q: "Comment fonctionne l'orchestration sans agent (Agentless SSH) ?",
    a: "Sovrack communique avec vos serveurs via SSH standard chiffré par clé Ed25519 ou RSA. Aucun agent lourd ne tourne sur votre machine, ce qui préserve 100% des ressources CPU et RAM de votre VPS pour vos applications.",
  },
  {
    q: "Puis-je commencer gratuitement sans carte bancaire ?",
    a: "Oui. Vous pouvez connecter votre premier serveur local (VMware/VirtualBox) ou VPS distant et déployer vos applications sans renseigner aucune carte bancaire.",
  },
  {
    q: "Puis-je migrer facilement depuis Vercel, Heroku ou Coolify ?",
    a: "Absolument. Vos configurations de variables d'environnement, dépôts Git et volumes Docker se transposent directement. Vous quittez les facturations à l'usage exorbitantes sans changer votre workflow de build.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-primary selection:bg-[#2563EB] selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-[1280px] px-6 lg:px-8">
        {/* HERO SECTION — Inspiré fidèlement de Supabase */}
        <section className="pt-14 pb-16 sm:pt-20 sm:pb-24 lg:pt-20 lg:pb-24">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Colonne gauche : Titre, sous-titre, CTA */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#121212] px-3.5 py-1 text-xs text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                <span>Plateforme de déploiement Open-Core</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 font-mono">v3.1</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-medium tracking-tight text-white leading-[1.12]">
                Déployez en un instant
                <span className="block text-[#2563EB] font-medium mt-1">
                  Maîtrisez vos serveurs
                </span>
              </h1>

              <p className="text-[16px] sm:text-[17px] text-zinc-400 font-normal leading-relaxed max-w-xl">
                La plateforme open-core pour orchestrer vos conteneurs Docker
                sur vos propres serveurs Ubuntu. Reliez vos dépôts Git, activez vos domaines HTTPS
                et pilotez vos releases en toute autonomie.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href={customerAppPath("/register")}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#2563EB] px-6 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
                >
                  Commencer gratuitement
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href={publicSitePath("/docs")}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-[#161616] px-6 text-sm font-medium text-white transition-colors hover:bg-[#202020]"
                >
                  Lire la documentation
                </Link>
              </div>

              <div className="flex items-center gap-6 pt-1 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#2563EB]" />
                  Sans carte bancaire
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#2563EB]" />
                  100% sur vos propres VPS
                </span>
              </div>
            </div>

            {/* Colonne droite : Widget terminal sans cadre blanc */}
            <div className="lg:col-span-5">
              <div className="rounded-xl bg-[#121212] p-5 font-mono text-xs shadow-2xl">
                {/* En-tête de terminal */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/40 text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />
                  </div>
                  <span className="text-[11px] text-zinc-400">sovrack release v3.1</span>
                  <Activity size={13} className="text-[#2563EB]" />
                </div>

                {/* Corps de log temps réel */}
                <div className="space-y-2 text-[12px] leading-relaxed">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-[#2563EB]">$</span>
                    <span className="text-zinc-200">sovrack deploy --target vps-production</span>
                  </div>
                  <p className="text-zinc-500 text-[11px]">→ Connexion SSH à 192.168.100.135:22... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Clone dépôt git@github.com:acme/api... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Détection Nixpacks (Node.js 22 LTS)... OK</p>
                  <p className="text-zinc-500 text-[11px]">→ Build conteneur Docker sha256:7b3a9e... OK</p>
                  <p className="text-emerald-400 text-[11px]">✓ Routage Nginx & HTTPS Let&apos;s Encrypt configurés</p>
                  <div className="mt-4 p-2.5 rounded-lg bg-[#0a0a0a] text-[11px] text-zinc-300 flex items-center justify-between">
                    <span className="truncate">https://api.mondomaine.com</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-sans text-[10px]">En ligne</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION FONCTIONNALITÉS — Cartes sans cadre blanc style Coolify */}
        <section className="py-14 sm:py-20">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
                Fonctionnalités
              </p>
              <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
                Tout ce qu&apos;il faut pour opérer vos services
              </h2>
            </div>
            <Link
              href={publicSitePath("/features")}
              className="text-xs text-[#2563EB] hover:text-[#3b82f6] transition-colors inline-flex items-center gap-1 font-medium"
            >
              Voir toutes les fonctionnalités
              <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {capabilities.map(({ icon: Icon, title, description, badge }) => (
              <div
                key={title}
                className="group rounded-xl bg-[#121212] p-6 transition-all duration-200 hover:bg-[#161616]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2563EB]/10 text-[#2563EB]">
                    <Icon size={16} />
                  </div>
                  <span className="text-[11px] uppercase font-mono tracking-wider text-zinc-600">
                    {badge}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-medium text-white">{title}</h3>
                <p className="mt-1.5 text-xs sm:text-[13px] text-zinc-400 leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION "OPEN SOURCE FROM DAY ONE" — Exactement comme la capture Supabase (Photo 6) */}
        <section className="py-16 sm:py-20">
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            {/* Colonne gauche */}
            <div className="lg:col-span-6 space-y-5">
              <h2 className="text-3xl sm:text-4xl font-normal tracking-tight text-white leading-tight">
                Open source from day one
              </h2>
              <p className="text-sm sm:text-[15px] text-zinc-400 font-normal leading-relaxed">
                Sovrack is built in the open because we believe great developer tools
                should be transparent, inspectable, and owned by the community. Read,
                contribute, self-host. You&apos;re never locked in, and always in control.
              </p>
              <div className="pt-2">
                <Link
                  href={BRAND_CONFIG.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[#161616] px-5 text-sm font-medium text-white transition-colors hover:bg-[#202020]"
                >
                  <GitHubIcon className="h-4 w-4" />
                  <span>View on GitHub</span>
                </Link>
              </div>
            </div>

            {/* Colonne droite : Digital Dot-Matrix display inspiré de Supabase (115.2k dots) */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl bg-[#121212] p-8 sm:p-10 flex flex-col items-center justify-center relative overflow-hidden">
                {/* Background dot pattern */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage: "radial-gradient(#2563EB 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <div className="relative text-center z-10 space-y-3">
                  <div className="font-mono text-5xl sm:text-6xl font-light tracking-widest text-[#2563EB] select-none">
                    100%
                  </div>
                  <div className="text-xs sm:text-sm font-mono uppercase tracking-[0.25em] text-zinc-300">
                    Open-Core &amp; Souverain
                  </div>
                  <p className="text-xs text-zinc-500 font-mono pt-1">
                    Zéro télémétrie cachée • BSL / Apache 2.0
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION COMPARAISON — Sans cadre blanc */}
        <section className="py-14 sm:py-16">
          <div className="max-w-xl mb-8">
            <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
              Souveraineté &amp; Coûts
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
              Reprenez le contrôle de votre infrastructure
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400">
              Ne payez plus de marges sur l&apos;usage de vos ressources cloud. Sovrack vous apporte la simplicité d&apos;un PaaS directement sur votre propre VPS.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl bg-[#121212]">
            <div className="grid grid-cols-3 bg-[#161616] p-4 text-xs font-medium text-zinc-400 border-b border-zinc-800/40">
              <span>Critère</span>
              <span className="text-[#2563EB] font-semibold">Sovrack (Open-Core)</span>
              <span>Cloud Fermé / PaaS</span>
            </div>
            <div className="divide-y divide-zinc-800/40 text-xs">
              {comparisons.map((item) => (
                <div key={item.feature} className="grid grid-cols-3 p-4 items-center">
                  <span className="font-medium text-white">{item.feature}</span>
                  <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[#2563EB] shrink-0" />
                    {item.sovrack}
                  </span>
                  <span className="text-zinc-500">{item.cloud}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION PARCOURS EN 3 ÉTAPES */}
        <section className="py-14 sm:py-16">
          <div className="text-center max-w-xl mx-auto mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
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
                className="rounded-xl bg-[#121212] p-6 hover:bg-[#161616] transition-colors"
              >
                <span className="font-mono text-xs text-[#2563EB] font-medium">
                  {step.num}
                </span>
                <h3 className="mt-2 text-sm font-medium text-white">{step.title}</h3>
                <p className="mt-1.5 text-xs sm:text-[13px] text-zinc-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION QUESTIONS FRÉQUENTES — Améliorée avec Accordéon interactif (Point C) */}
        <section className="py-16 sm:py-20">
          <div className="max-w-xl mx-auto text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
              FAQ
            </p>
            <h2 className="mt-1 text-2xl sm:text-3xl font-normal tracking-tight text-white">
              Questions fréquentes
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400">
              Tout ce que vous devez savoir pour démarrer avec Sovrack.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={faq.q}
                  className="rounded-xl bg-[#121212] transition-colors overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 focus:outline-none"
                  >
                    <span className="text-[14px] sm:text-[15px] font-medium text-white">
                      {faq.q}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-zinc-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-180 text-[#2563EB]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/40">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* BANNIÈRE FINALE CTA — Sans cadre blanc, direct sur le fond (Point D / Photo 5 Supabase) */}
        <section className="py-20 sm:py-28 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-white">
            Déployez votre premier projet dès aujourd&apos;hui
          </h2>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 max-w-lg mx-auto">
            Rejoignez les développeurs qui gèrent leur infrastructure en toute liberté avec Sovrack.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={customerAppPath("/register")}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#2563EB] px-6 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
            >
              Créer mon compte
              <ArrowRight size={14} />
            </Link>
            <Link
              href={publicSitePath("/docs")}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[#161616] px-6 text-sm font-medium text-white transition-colors hover:bg-[#202020]"
            >
              Consulter la documentation
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs text-zinc-400">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-[#2563EB]" />
              100% Souverain
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-[#2563EB]" />
              Open-Core Transparent
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-[#2563EB]" />
              Zéro Vendor Lock-In
            </span>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
