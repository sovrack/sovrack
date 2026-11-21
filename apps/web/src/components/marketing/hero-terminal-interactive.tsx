"use client";

import { useEffect, useState } from "react";

export function HeroTerminalInteractive() {
  // Démarre à l'étape 5 pour que le rendu initial et le SSR affichent l'ensemble complet sans délai
  const [activeStep, setActiveStep] = useState(5);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const timeouts: NodeJS.Timeout[] = [];

    const runCycle = () => {
      setActiveStep(1);
      timeouts.push(setTimeout(() => setActiveStep(2), 700));
      timeouts.push(setTimeout(() => setActiveStep(3), 1400));
      timeouts.push(setTimeout(() => setActiveStep(4), 2100));
      timeouts.push(setTimeout(() => setActiveStep(5), 2800));
    };

    // Après 5 secondes d'affichage complet initial, lance la boucle automatique fluide
    const initialDelay = setTimeout(() => {
      runCycle();
      timer = setInterval(runCycle, 8500);
    }, 5000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(timer);
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#101012] p-5 shadow-2xl font-mono text-xs">
      {/* En-tête macOS épuré : 3 points simples sans bouton ni texte v3.1 */}
      <div className="flex items-center pb-3 mb-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
        </div>
      </div>

      {/* Corps du terminal : hauteur 100% stable sans variation de taille */}
      <div className="space-y-2 text-[12px] leading-relaxed pt-1">
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[#2563EB] font-bold">$</span>
          <span className="text-zinc-200">sovrack deploy --target vps-production</span>
        </div>

        <p
          className={`text-zinc-400 text-[11px] transition-opacity duration-300 ${
            activeStep >= 1 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          → Connexion SSH à 192.168.100.135:22...{" "}
          <span className="text-emerald-400 font-semibold">OK</span>
        </p>

        <p
          className={`text-zinc-400 text-[11px] transition-opacity duration-300 ${
            activeStep >= 2 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          → Clone dépôt git@github.com:acme/api (branch: main)...{" "}
          <span className="text-emerald-400 font-semibold">OK</span>
        </p>

        <p
          className={`text-zinc-400 text-[11px] transition-opacity duration-300 ${
            activeStep >= 3 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          → Détection Nixpacks (Node.js 22 LTS)...{" "}
          <span className="text-emerald-400 font-semibold">OK</span>
        </p>

        <p
          className={`text-zinc-400 text-[11px] transition-opacity duration-300 ${
            activeStep >= 4 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          → Build conteneur Docker sha256:7b3a9e...{" "}
          <span className="text-emerald-400 font-semibold">OK</span>
        </p>

        <p
          className={`text-emerald-400 text-[11px] transition-opacity duration-300 ${
            activeStep >= 5 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          ✓ Routage Nginx &amp; HTTPS Let&apos;s Encrypt configurés
        </p>

        {/* Carte de statut domaine avec hauteur réservée pour zéro décalage */}
        <div
          className={`mt-3 p-2.5 rounded-lg bg-[#080808] text-[11px] text-zinc-300 flex items-center justify-between border border-zinc-800/40 transition-opacity duration-300 ${
            activeStep >= 5 ? "opacity-100" : "opacity-0 select-none pointer-events-none"
          }`}
        >
          <span className="truncate text-zinc-300">https://api.mondomaine.com</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans text-[10px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            En ligne
          </span>
        </div>
      </div>
    </div>
  );
}
