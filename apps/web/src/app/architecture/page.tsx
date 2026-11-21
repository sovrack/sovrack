"use client";

import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Server,
} from "lucide-react";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";
import { publicSitePath } from "@/shared/config/product-urls";

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-app text-primary selection:bg-accent selection:text-white">
      <MarketingNavbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Architecture Système
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-normal tracking-tight text-white leading-tight">
            Conception technique de Sovrack
          </h1>
          <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
            Une architecture conçue pour la résilience, la stricte isolation des données et l&apos;absence totale de vendor lock-in.
          </p>
        </div>

        {/* 3 plans multi-hôtes */}
        <section className="border-t border-border/70 pt-10">
          <h2 className="text-xl font-normal text-white">Séparation stricte des 3 plans web</h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
            Chaque plan dispose de ses propres responsabilités et de cookies host-only hermétiques pour prévenir toute compromission croisée.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
            <div className="rounded-lg border border-border/70 bg-card/50 p-5">
              <span className="font-mono text-xs text-accent">sovrack.com</span>
              <h3 className="mt-2 text-sm font-medium text-white">Site Public & Docs</h3>
              <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                Documentation, pages vitrine et tarifs. Aucun cookie de session client ni staff n&apos;est transmis sur ce domaine.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/50 p-5">
              <span className="font-mono text-xs text-emerald-400">app.sovrack.com</span>
              <h3 className="mt-2 text-sm font-medium text-white">Console Client</h3>
              <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                Authentification client, pilotage des serveurs, logs WebSocket et gestion des projets avec cookies Host-Only stricts.
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-card/50 p-5">
              <span className="font-mono text-xs text-amber-400">staff.sovrack.com</span>
              <h3 className="mt-2 text-sm font-medium text-white">Back-Office Sovrack</h3>
              <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
                Administration interne et métriques globales avec MFA obligatoire et piste d&apos;audit infalsifiable.
              </p>
            </div>
          </div>
        </section>

        {/* Modèle sans agent */}
        <section className="border-t border-border/70 pt-10 mt-14">
          <h2 className="text-xl font-normal text-white">Moteur d&apos;exécution sans agent (Agentless SSH)</h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
            Vos serveurs restent standards et légers. Sovrack utilise les primitives Unix standard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
            <div className="rounded-lg border border-border/70 bg-card/50 p-5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Server size={16} />
                <h3 className="text-sm font-medium text-white">SSH standard + Docker Socket</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Toutes les commandes sont orchestrées au travers d&apos;un canal SSH chiffré par clé Ed25519 ou RSA. Aucun agent résident ne consomme de RAM ou n&apos;ouvre de port réseau tiers sur vos serveurs.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-card/50 p-5">
              <div className="flex items-center gap-2 text-accent mb-2">
                <Globe size={16} />
                <h3 className="text-sm font-medium text-white">Reverse-Proxy Nginx & Let&apos;s Encrypt</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Nginx route les requêtes HTTP/HTTPS vers vos conteneurs Docker via des configurations modulaires. Les certificats TLS sont renouvelés automatiquement par le gestionnaire ACME intégré.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="mt-16 rounded-xl border border-border/80 bg-zinc-950/80 p-8 text-center">
          <h3 className="text-xl font-normal text-white">
            Découvrez comment connecter votre premier serveur
          </h3>
          <p className="mt-2 text-xs text-zinc-400 max-w-md mx-auto">
            Consultez le guide de démarrage ou connectez votre VPS en quelques secondes.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={publicSitePath("/docs")}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-xs font-medium text-white hover:bg-accent-hover transition-colors shadow-sm"
            >
              Consulter la documentation
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
