"use client";

import { useState } from "react";
import { Activity, CheckCircle2, Play, RefreshCw, Terminal } from "lucide-react";

export function HeroTerminalInteractive() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(5);

  const runSimulation = () => {
    if (isRunning) return;
    setIsRunning(true);
    setActiveStep(1);

    setTimeout(() => setActiveStep(2), 600);
    setTimeout(() => setActiveStep(3), 1200);
    setTimeout(() => setActiveStep(4), 1800);
    setTimeout(() => {
      setActiveStep(5);
      setIsRunning(false);
    }, 2400);
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#101012] p-5 shadow-2xl font-mono text-xs">
      {/* En-tête macOS avec bouton d'action interactif */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          <span className="ml-2 text-[11px] text-zinc-400 font-sans">sovrack release v3.1</span>
        </div>

        <button
          type="button"
          onClick={runSimulation}
          disabled={isRunning}
          title="Relancer la simulation du déploiement"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#18181b] hover:bg-[#222226] text-[11px] font-sans font-medium text-zinc-300 transition-colors border border-zinc-800 disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <RefreshCw size={11} className="animate-spin text-[#2563EB]" />
              <span>Déploiement en cours…</span>
            </>
          ) : (
            <>
              <Play size={10} className="fill-[#2563EB] text-[#2563EB]" />
              <span>Simuler un déploiement</span>
            </>
          )}
        </button>
      </div>

      {/* Corps du terminal avec logs réactifs */}
      <div className="space-y-2 text-[12px] leading-relaxed pt-1">
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-[#2563EB] font-bold">$</span>
          <span className="text-zinc-200">sovrack deploy --target vps-production</span>
        </div>

        {activeStep >= 1 && (
          <p className="text-zinc-400 text-[11px] transition-opacity duration-200">
            → Connexion SSH à 192.168.100.135:22... <span className="text-emerald-400 font-semibold">OK</span>
          </p>
        )}

        {activeStep >= 2 && (
          <p className="text-zinc-400 text-[11px] transition-opacity duration-200">
            → Clone dépôt git@github.com:acme/api (branch: main)... <span className="text-emerald-400 font-semibold">OK</span>
          </p>
        )}

        {activeStep >= 3 && (
          <p className="text-zinc-400 text-[11px] transition-opacity duration-200">
            → Détection Nixpacks (Node.js 22 LTS)... <span className="text-emerald-400 font-semibold">OK</span>
          </p>
        )}

        {activeStep >= 4 && (
          <p className="text-zinc-400 text-[11px] transition-opacity duration-200">
            → Build conteneur Docker sha256:7b3a9e... <span className="text-emerald-400 font-semibold">OK</span>
          </p>
        )}

        {activeStep >= 5 && (
          <>
            <p className="text-emerald-400 text-[11px] transition-opacity duration-200">
              ✓ Routage Nginx &amp; HTTPS Let&apos;s Encrypt configurés
            </p>
            <div className="mt-3 p-2.5 rounded-lg bg-[#080808] text-[11px] text-zinc-300 flex items-center justify-between border border-zinc-800/40">
              <span className="truncate text-zinc-300">https://api.mondomaine.com</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans text-[10px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                En ligne
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
