"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  Layers,
  Server,
  Terminal,
  Zap,
} from "lucide-react";

export function HeroDashboardPreview() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "terminal">("dashboard");

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#101010] p-4 sm:p-5 shadow-2xl">
      {/* Fenêtre en-tête macOS style */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
          </div>

          <div className="ml-3 flex items-center gap-1 rounded-lg bg-[#0a0a0a] p-0.5 border border-zinc-800/60">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === "dashboard"
                  ? "bg-[#2563EB] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Tableau de bord
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                activeTab === "terminal"
                  ? "bg-[#2563EB] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Terminal SSH
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            vps-production (100% OK)
          </span>
        </div>
      </div>

      {/* Contenu de l'onglet actif */}
      {activeTab === "dashboard" ? (
        <div className="space-y-2 text-xs">
          {/* Ligne 1 : Application Backend */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0a] border border-zinc-800/40 hover:border-zinc-700 transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[#2563EB] shrink-0">
                <Layers size={14} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-[13px]">api-production</p>
                <p className="text-[10px] text-zinc-500 font-mono">Node.js 22 • Nixpacks</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex text-[11px] font-mono text-zinc-400">
                https://api.mondomaine.com
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans text-[10px] font-medium">
                En ligne
              </span>
            </div>
          </div>

          {/* Ligne 2 : Base de données PostgreSQL */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0a] border border-zinc-800/40 hover:border-zinc-700 transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                <Database size={14} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-[13px]">postgres-production</p>
                <p className="text-[10px] text-zinc-500 font-mono">PostgreSQL 16 • Volume persistant</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex text-[11px] font-mono text-zinc-500">
                port 5432 (isolé)
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans text-[10px] font-medium">
                En ligne
              </span>
            </div>
          </div>

          {/* Ligne 3 : Frontend Web */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#0a0a0a] border border-zinc-800/40 hover:border-zinc-700 transition">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
                <Zap size={14} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate text-[13px]">app-client-web</p>
                <p className="text-[10px] text-zinc-500 font-mono">Next.js 15 • Standalone</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex text-[11px] font-mono text-zinc-400">
                https://app.mondomaine.com
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-sans text-[10px] font-medium">
                En ligne
              </span>
            </div>
          </div>

          {/* Métriques récapitulatives en bas */}
          <div className="mt-3 pt-3 border-t border-zinc-800/40 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
            <span>Serveur : 192.168.100.135</span>
            <span className="text-zinc-500">CPU: 14% • RAM: 412 MB / 4 GB</span>
          </div>
        </div>
      ) : (
        /* Vue Terminal SSH */
        <div className="space-y-2 font-mono text-[12px] leading-relaxed p-1">
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="text-[#2563EB] font-bold">$</span>
            <span className="text-zinc-200">sovrack deploy --target vps-production</span>
          </div>
          <p className="text-zinc-500 text-[11px]">→ Connexion SSH à 192.168.100.135:22... OK</p>
          <p className="text-zinc-500 text-[11px]">→ Clone dépôt git@github.com:acme/api... OK</p>
          <p className="text-zinc-500 text-[11px]">→ Détection Nixpacks (Node.js 22 LTS)... OK</p>
          <p className="text-zinc-500 text-[11px]">→ Build conteneur Docker sha256:7b3a9e... OK</p>
          <p className="text-emerald-400 text-[11px]">✓ Routage Nginx & HTTPS Let&apos;s Encrypt configurés</p>
          <div className="mt-3 p-2 rounded-lg bg-[#0a0a0a] text-[11px] text-zinc-300 flex items-center justify-between">
            <span className="truncate">https://api.mondomaine.com</span>
            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-sans text-[10px]">
              En ligne
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
