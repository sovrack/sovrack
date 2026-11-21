"use client";

import { useState } from "react";
import {
  GitCommit,
  Server,
  Cpu,
  CheckCircle2,
  Terminal,
  Activity,
  Zap,
  Play,
  RotateCcw,
  Shield,
  Layers,
  ArrowRight,
} from "lucide-react";
import { SovrackLogo } from "@/shared/ui/sovrack-logo";

type ServerTarget = {
  id: string;
  name: string;
  type: string;
  ip: string;
  containers: number;
  cpu: number;
  ram: number;
  status: "online" | "syncing" | "ready";
  ssl: boolean;
};

const servers: ServerTarget[] = [
  {
    id: "vps-prod",
    name: "vps-production-01",
    type: "VPS Ubuntu 24.04 LTS",
    ip: "185.192.x.x",
    containers: 6,
    cpu: 18,
    ram: 42,
    status: "online",
    ssl: true,
  },
  {
    id: "vps-staging",
    name: "vps-staging-vmware",
    type: "VM Locale Ubuntu",
    ip: "192.168.100.135:22",
    containers: 2,
    cpu: 8,
    ram: 24,
    status: "online",
    ssl: true,
  },
  {
    id: "server-baremetal",
    name: "serveur-dedie-alpha",
    type: "Serveur Bare-Metal Dédié",
    ip: "51.89.x.x",
    containers: 12,
    cpu: 28,
    ram: 58,
    status: "online",
    ssl: true,
  },
];

export function HowItWorksInteractive() {
  const [selectedServer, setSelectedServer] = useState<string>("vps-prod");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStep, setSimStep] = useState<number>(0);

  const activeServer =
    servers.find((s) => s.id === selectedServer) || servers[0];

  const triggerSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimStep(1);

    setTimeout(() => setSimStep(2), 700);
    setTimeout(() => setSimStep(3), 1500);
    setTimeout(() => {
      setSimStep(4);
      setTimeout(() => {
        setIsSimulating(false);
        setSimStep(0);
      }, 1200);
    }, 2200);
  };

  return (
    <section className="py-16 sm:py-24 border-t border-zinc-800/30">
      <div className="text-center max-w-2xl mx-auto mb-14">
        <p className="text-xs font-mono font-medium uppercase tracking-[0.2em] text-[#2563EB]">
          Architecture &amp; Orchestration
        </p>
        <h2 className="mt-2 text-3xl sm:text-4xl lg:text-[42px] font-medium tracking-tight text-white leading-tight">
          Poussez votre code.
          <span className="block text-[#2563EB] font-medium mt-1">
            Sovrack orchestre le reste.
          </span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
          De votre commit Git jusqu&apos;à vos conteneurs en production : aucun agent résident intrusif,
          connexion SSH directe et routage SSL zero-downtime sur vos propres serveurs.
        </p>

        {/* Bouton de simulation interactive */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={triggerSimulation}
            disabled={isSimulating}
            className="inline-flex items-center gap-2 rounded-full border border-[#2563EB]/40 bg-[#2563EB]/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[#2563EB]/20 disabled:opacity-50"
          >
            {isSimulating ? (
              <>
                <RotateCcw size={12} className="animate-spin text-[#2563EB]" />
                <span>Simulation du flux en cours (Étape {simStep}/4)...</span>
              </>
            ) : (
              <>
                <Play size={12} className="fill-[#2563EB] text-[#2563EB]" />
                <span>Cliquer pour simuler un déploiement Git</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagramme d'architecture interactif Sovrack */}
      <div className="relative rounded-2xl bg-[#0e0e0e] border border-zinc-800/60 p-6 sm:p-10 shadow-2xl overflow-hidden">
        {/* Glow décoratif de fond */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#2563EB]/5 blur-[120px] pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Étape 1 : Source Git */}
          <div className="lg:col-span-3">
            <div
              className={`rounded-xl border p-5 transition-all duration-300 ${
                simStep === 1
                  ? "border-[#2563EB] bg-[#2563EB]/10 shadow-[0_0_25px_rgba(37,99,235,0.25)]"
                  : "border-zinc-800/70 bg-[#121212]"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Source Git</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-white">
                  <GitCommit size={20} className="text-[#2563EB]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">git push</h4>
                  <p className="text-[11px] font-mono text-zinc-400">branch: main (#fcff736)</p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/40 text-[11px] text-zinc-400 leading-relaxed">
                GitHub ou GitLab déclenche le webhook chiffré vers Sovrack.
              </div>
            </div>
          </div>

          {/* Connecteur 1 (visible desktop) */}
          <div className="hidden lg:flex lg:col-span-1 justify-center items-center">
            <div className="relative flex items-center justify-center w-full">
              <div className="w-full h-0.5 bg-zinc-800" />
              <div
                className={`absolute w-3 h-3 rounded-full bg-[#2563EB] transition-all duration-500 shadow-[0_0_10px_#2563EB] ${
                  simStep >= 1 ? "scale-125 opacity-100" : "scale-75 opacity-40"
                }`}
              />
            </div>
          </div>

          {/* Étape 2 : Cœur de Sovrack */}
          <div className="lg:col-span-4">
            <div
              className={`relative rounded-2xl border p-6 transition-all duration-300 text-center ${
                simStep === 2 || simStep === 3
                  ? "border-[#2563EB] bg-[#121829] shadow-[0_0_35px_rgba(37,99,235,0.3)] ring-1 ring-[#2563EB]"
                  : "border-zinc-800/80 bg-[#141414]"
              }`}
            >
              <div className="inline-flex items-center gap-2 mb-3">
                <SovrackLogo className="w-6 h-6 text-white shrink-0" width={24} height={24} />
                <span className="text-lg font-bold tracking-tight text-white">sovrack</span>
              </div>
              <p className="text-xs text-zinc-400 font-medium mb-4">
                Moteur de build sans agent SSH
              </p>

              <div className="grid grid-cols-3 gap-2 text-left mb-4">
                <div className="rounded-lg bg-[#0a0a0a] p-2.5 border border-zinc-800/40">
                  <p className="text-[10px] text-zinc-500 uppercase">Build</p>
                  <p className="text-xs font-semibold text-white mt-0.5">Nixpacks</p>
                </div>
                <div className="rounded-lg bg-[#0a0a0a] p-2.5 border border-zinc-800/40">
                  <p className="text-[10px] text-zinc-500 uppercase">Canal</p>
                  <p className="text-xs font-semibold text-white mt-0.5">SSH Direct</p>
                </div>
                <div className="rounded-lg bg-[#0a0a0a] p-2.5 border border-zinc-800/40">
                  <p className="text-[10px] text-zinc-500 uppercase">Sécurité</p>
                  <p className="text-xs font-semibold text-white mt-0.5">SSL Auto</p>
                </div>
              </div>

              <div className="rounded-lg bg-[#0a0a0a] p-3 text-left font-mono text-[11px] text-zinc-400 border border-zinc-800/40">
                <div className="flex items-center justify-between text-zinc-500 mb-1">
                  <span>pipeline-state</span>
                  <Activity size={12} className={simStep >= 2 ? "text-[#2563EB] animate-pulse" : "text-zinc-600"} />
                </div>
                <p className="text-zinc-300">
                  {simStep === 0 && "En attente de release…"}
                  {simStep === 1 && "→ Réception du webhook Git"}
                  {simStep === 2 && "→ Détection runtime & compilation Nixpacks"}
                  {simStep === 3 && "→ Déploiement conteneurs par SSH"}
                  {simStep === 4 && "✓ Déployé avec succès (zero-downtime)"}
                </p>
              </div>
            </div>
          </div>

          {/* Connecteur 2 (visible desktop) */}
          <div className="hidden lg:flex lg:col-span-1 justify-center items-center">
            <div className="relative flex items-center justify-center w-full">
              <div className="w-full h-0.5 bg-zinc-800" />
              <div
                className={`absolute w-3 h-3 rounded-full bg-[#2563EB] transition-all duration-500 shadow-[0_0_10px_#2563EB] ${
                  simStep >= 3 ? "scale-125 opacity-100" : "scale-75 opacity-40"
                }`}
              />
            </div>
          </div>

          {/* Étape 3 : Serveurs cibles interactifs */}
          <div className="lg:col-span-3 space-y-3">
            <p className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
              Serveurs cibles (Cliquer pour inspecter)
            </p>

            {servers.map((server) => {
              const isSelected = server.id === selectedServer;
              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => setSelectedServer(server.id)}
                  className={`w-full text-left rounded-xl p-3.5 border transition-all duration-200 ${
                    isSelected
                      ? "border-[#2563EB] bg-[#121212] ring-1 ring-[#2563EB]/50"
                      : "border-zinc-800/50 bg-[#101010] hover:bg-[#141414] hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {server.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">{server.ip}</span>
                  </div>

                  <p className="text-[11px] text-zinc-400 mb-2">{server.type}</p>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono pt-2 border-t border-zinc-800/40">
                    <span>{server.containers} conteneurs</span>
                    <span className="text-zinc-400">CPU {server.cpu}%</span>
                    <span className="text-zinc-400">RAM {server.ram}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Détail live du serveur sélectionné */}
        <div className="mt-8 pt-6 border-t border-zinc-800/40 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB]">
              <Server size={16} />
            </div>
            <div>
              <p className="font-medium text-white">
                Cible active : <span className="font-mono text-[#2563EB]">{activeServer.name}</span>
              </p>
              <p className="text-zinc-500 text-[11px]">
                {activeServer.type} • IP: {activeServer.ip} • Certificat SSL Let&apos;s Encrypt actif
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-[11px]">
              <CheckCircle2 size={12} /> Healthcheck 100%
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#2563EB]/10 border border-[#2563EB]/20 text-[#2563EB] font-medium text-[11px]">
              <Shield size={12} /> SSH Authentifié
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
