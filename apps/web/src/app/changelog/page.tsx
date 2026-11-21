"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, GitCommit, Sparkles, Tag } from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { customerAppPath, publicSitePath } from "@/shared/config/product-urls";

const releases = [
  {
    version: "v3.1.0",
    date: "20 Novembre 2026",
    badge: "Version Actuelle",
    highlights: [
      "Refonte moderne de l'interface d'authentification et alignement épuré de la barre de navigation.",
      "Adoption du thème sombre profond (#0a0a0a) et de l'accent bleu électrique Sovrack (#2563EB).",
      "Connexion et inscription simplifiées : saisie par email avec dérivation automatique du profil.",
      "Bouton de pré-remplissage et connexion en 1-clic pour l'environnement de développement local.",
      "Sécurisation des composants SVG vectoriels avec dimensions explicites pour prévenir les décalages de rendu.",
      "Consolidation intégrale de la documentation dans le dossier racine /docs.",
      "Support officiel de l'environnement de staging sur machine virtuelle Ubuntu locale.",
    ],
  },
  {
    version: "v3.0.0",
    date: "Octobre 2026",
    badge: "Majeure",
    highlights: [
      "Séparation stricte des trois plans web : vitrine publique, application client et administration staff.",
      "Moteur de build hybride : support natif des Dockerfiles et détection automatique Nixpacks.",
      "Streaming des logs de build et de conteneur en direct via WebSockets.",
      "Terminal SSH interactif intégré dans le navigateur basé sur xterm.js.",
      "Gestion multi-tenant avec séparation hermétique entre espaces personnels et organisations collaboratives.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-primary selection:bg-[#2563EB] selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-[1280px] px-6 sm:px-12 lg:px-24 py-12 sm:py-16">
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-mono font-medium uppercase tracking-wider text-[#2563EB]">
            Historique des versions
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-medium tracking-tight text-white leading-tight">
            Changelog Sovrack
          </h1>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
            Découvrez les dernières améliorations, correctifs et nouvelles fonctionnalités apportées à la plateforme Sovrack.
          </p>
        </div>

        <div className="space-y-8">
          {releases.map((rel) => (
            <article
              key={rel.version}
              className="rounded-2xl bg-[#121212] p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-lg font-medium font-mono text-white">
                  {rel.version}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/30 text-[11px] font-medium text-[#2563EB]">
                  {rel.badge}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {rel.date}
                </span>
              </div>

              <ul className="space-y-3 mt-5">
                {rel.highlights.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-3 text-xs sm:text-sm text-zinc-300 leading-relaxed"
                  >
                    <CheckCircle2
                      size={16}
                      className="text-[#2563EB] shrink-0 mt-0.5"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
