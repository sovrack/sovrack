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
      "Refonte de l'interface d'authentification inspirée de Vercel & Supabase avec alignement topbar fixe.",
      "Adoption du thème sombre profond Coolify (#0a0a0a) et du bleu électrique Sovrack (#2563EB).",
      "Connexion et inscription simplifiées : saisie par email uniquement avec dérivation automatique du profil.",
      "Bouton de pré-remplissage et connexion en 1-clic pour l'environnement de développement local.",
      "Sécurisation des composants SVG vectoriels avec dimensions explicites pour prévenir les décalages de rendu.",
      "Consolidation intégrale de la documentation dans le dossier racine /docs.",
      "Support officiel de l'environnement de staging sur VM Ubuntu locale (VMware/VirtualBox).",
    ],
  },
  {
    version: "v3.0.0",
    date: "Octobre 2026",
    badge: "Majeure",
    highlights: [
      "Séparation stricte des trois plans web : sovrack.com, app.sovrack.com et staff.sovrack.com.",
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
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Historique des versions
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-normal tracking-tight text-white leading-tight">
            Changelog Sovrack
          </h1>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
            Découvrez les dernières améliorations, correctifs et nouvelles fonctionnalités apportées à la plateforme Sovrack.
          </p>
        </div>

        <div className="space-y-12">
          {releases.map((rel) => (
            <article
              key={rel.version}
              className="border-t border-border/70 pt-8"
            >
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="text-base font-medium font-mono text-white">
                  {rel.version}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-[11px] font-medium text-accent">
                  {rel.badge}
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {rel.date}
                </span>
              </div>

              <ul className="space-y-2.5 mt-4">
                {rel.highlights.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed"
                  >
                    <CheckCircle2
                      size={15}
                      className="text-accent shrink-0 mt-0.5"
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
