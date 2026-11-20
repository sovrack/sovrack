"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Cpu,
  Globe,
  Key,
  Layers,
  RefreshCw,
  Server,
  Shield,
  Terminal,
} from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { customerAppPath } from "@/shared/config/product-urls";

const featureGroups = [
  {
    category: "Conteneurisation & Builds",
    description: "Du code source au conteneur Docker en production sans étape intermédiaire complexe.",
    items: [
      {
        icon: Boxes,
        title: "Support Nixpacks & Dockerfile",
        desc: "Détecte automatiquement votre runtime (Node.js, Go, Python, PHP, Rust, Ruby) et génère une image minimale et optimisée.",
      },
      {
        icon: RefreshCw,
        title: "Déploiements Zero-Downtime",
        desc: "Lancement du nouveau conteneur et vérification du Healthcheck avant de basculer le trafic Nginx.",
      },
      {
        icon: Layers,
        title: "Bases de données en 1 clic",
        desc: "Déployez Postgres, Redis, MySQL ou MongoDB avec volumes persistants et variables injectées automatiquement.",
      },
    ],
  },
  {
    category: "Infrastructure & VPS",
    description: "Contrôlez vos serveurs physiques ou machines virtuelles en toute indépendance.",
    items: [
      {
        icon: Server,
        title: "Connexion SSH sans agent lourd",
        desc: "Sovrack communique avec vos serveurs via SSH standard. Aucun démon intrusif ou binaire résident obligatoire.",
      },
      {
        icon: Cpu,
        title: "Monitoring des ressources",
        desc: "Suivez l'utilisation CPU, RAM, disque et statut de chaque conteneur Docker directement depuis la console.",
      },
      {
        icon: Terminal,
        title: "Terminal Web interactif",
        desc: "Ouvrez une session interactive sécurisée xterm.js directement sur votre VPS pour vos opérations de maintenance.",
      },
    ],
  },
  {
    category: "Domaines & Sécurité",
    description: "Protection de bout en bout pour vos services web et vos équipes.",
    items: [
      {
        icon: Globe,
        title: "HTTPS & Let's Encrypt automatique",
        desc: "Génération, configuration et renouvellement silencieux de vos certificats SSL pour tous vos domaines et sous-domaines.",
      },
      {
        icon: Key,
        title: "Gestion des secrets chiffrés",
        desc: "Variables d'environnement stockées de façon chiffrée et injectées uniquement au runtime du conteneur.",
      },
      {
        icon: Shield,
        title: "Contrôle d'accès par rôle (RBAC)",
        desc: "Séparez vos projets dans des espaces dédiés et assignez des permissions précises (Propriétaire, Développeur, Observateur).",
      },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-primary selection:bg-[#2563EB] selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-[1280px] px-6 lg:px-8 py-12 sm:py-16">
        <div className="max-w-xl mb-12">
          <p className="text-xs font-medium uppercase tracking-wider text-[#2563EB]">
            Capacités complètes
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-normal tracking-tight text-white leading-tight">
            Toutes les fonctionnalités de Sovrack
          </h1>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed font-normal">
            Une suite d&apos;outils complète pour déployer, configurer et monitorer vos applications sur vos propres serveurs, avec la simplicité du cloud moderne.
          </p>
        </div>

        <div className="space-y-12">
          {featureGroups.map((group) => (
            <section key={group.category} className="pt-4">
              <div className="mb-5">
                <h2 className="text-lg font-normal text-white">{group.category}</h2>
                <p className="mt-0.5 text-xs text-zinc-400">{group.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {group.items.map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl bg-[#121212] p-5 hover:bg-[#161616] transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2563EB]/10 text-[#2563EB] mb-3">
                      <Icon size={16} />
                    </div>
                    <h3 className="text-sm font-medium text-white">{title}</h3>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl bg-[#121212] p-8 sm:p-10 text-center">
          <h3 className="text-xl sm:text-2xl font-normal text-white">
            Prêt à simplifier vos déploiements ?
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            Connectez votre premier serveur et déployez votre première application en quelques minutes.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={customerAppPath("/register")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#2563EB] px-4 text-xs font-medium text-white transition-colors hover:bg-[#1d4ed8]"
            >
              Créer un compte gratuit
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
