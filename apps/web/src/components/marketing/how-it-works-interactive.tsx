"use client";

import { GitBranch } from "lucide-react";

export function HowItWorksInteractive() {
  const servers = [
    {
      name: "vps-production",
      role: "Docker · Nginx",
      dots: ["bg-emerald-400", "bg-emerald-400"],
      tag: "Production",
    },
    {
      name: "vps-staging",
      role: "Preview Env",
      dots: ["bg-emerald-400", "bg-amber-400"],
      tag: "Staging",
    },
    {
      name: "serveur-dedie",
      role: "PostgreSQL 16",
      dots: ["bg-emerald-400", "bg-emerald-400"],
      tag: "Base DB",
    },
  ];

  return (
    <section className="py-20 sm:py-28 text-center overflow-hidden">
      {/* En-tête de section style Supabase / Coolify */}
      <div className="max-w-2xl mx-auto mb-14 sm:mb-16 px-4">
        <p className="text-xs font-mono font-medium uppercase tracking-[0.2em] text-zinc-500 mb-3">
          COMMENT ÇA MARCHE
        </p>
        <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-medium tracking-tight text-white leading-tight">
          Poussez votre code.
          <span className="block text-white font-medium mt-1">
            Sovrack orchestre le reste.
          </span>
        </h2>
        <p className="mt-4 text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
          De votre commit Git jusqu&apos;à vos conteneurs en production : aucun agent lourd,
          tunnel SSH direct et certificats Let&apos;s Encrypt automatiques.
        </p>
      </div>

      {/* Diagramme Vertical sans cadre & flux séquentiel synchronisé */}
      <div className="relative max-w-4xl mx-auto px-4 flex flex-col items-center">
        {/* Étape 1 (Haut) : git push */}
        <div className="z-10 shrink-0">
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-[#121212] px-6 py-3.5 shadow-xl hover:border-zinc-700 transition">
            <GitBranch size={20} className="text-zinc-300" strokeWidth={2} />
            <span className="font-mono text-sm sm:text-base font-medium text-white tracking-wide">
              git push
            </span>
          </div>
        </div>

        {/* Connecteur vertical 1 : Ligne descendante de git push vers Sovrack */}
        <div className="w-full flex justify-center h-16 relative">
          <svg
            className="h-16 w-12 overflow-visible pointer-events-none"
            viewBox="0 0 48 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter
                id="glow-particle-top"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Ligne pointillée verticale */}
            <line
              x1="24"
              y1="0"
              x2="24"
              y2="64"
              stroke="#3f3f46"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* Particule Phase 1 : descend de git push et ENTRE dans Sovrack (0% -> 36%) */}
            <g>
              <animateMotion
                path="M 24 0 L 24 64"
                dur="4.2s"
                repeatCount="indefinite"
                keyTimes="0; 0.36; 0.37; 1"
                keyPoints="0; 1; 1; 1"
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0; 1; 1; 0; 0"
                keyTimes="0; 0.05; 0.34; 0.36; 1"
                dur="4.2s"
                repeatCount="indefinite"
              />
              <circle r="5" fill="#38bdf8" filter="url(#glow-particle-top)" />
              <circle r="2" fill="#ffffff" />
            </g>
          </svg>
        </div>

        {/* Étape 2 (Milieu) : Sovrack avec halo bleu électrique et pulsation d'orchestration */}
        <div className="z-10 shrink-0 relative">
          <div className="absolute inset-0 rounded-2xl bg-[#2563EB]/25 blur-2xl -z-10 animate-pulse" />
          <div className="sovrack-box rounded-2xl border-2 border-[#2563EB] bg-[#121212] px-9 py-5 text-center shadow-[0_0_35px_rgba(37,99,235,0.35)] min-w-[230px]">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38bdf8] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2563EB]" />
              </span>
              <h3 className="text-xl font-bold tracking-tight text-white">
                Sovrack
              </h3>
            </div>
            <p className="text-xs font-mono text-zinc-400 tracking-wider">
              build · deploy · proxy
            </p>
          </div>
        </div>

        {/* Connecteur vertical 2 (Desktop) : 3 branches descendantes vers les serveurs */}
        <div className="hidden md:flex w-full justify-center h-20 relative">
          <svg
            className="w-full h-20 max-w-4xl overflow-visible pointer-events-none"
            viewBox="0 0 800 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <filter
                id="glow-particle-bot"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Branche gauche vers serveur 1 */}
            <path
              d="M 400 0 C 400 45, 130 35, 130 80"
              stroke="#3f3f46"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Branche centre vers serveur 2 */}
            <line
              x1="400"
              y1="0"
              x2="400"
              y2="80"
              stroke="#3f3f46"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Branche droite vers serveur 3 */}
            <path
              d="M 400 0 C 400 45, 670 35, 670 80"
              stroke="#3f3f46"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* Particule 1 (Gauche) - Phase 3 : émerge de Sovrack après absorption (43% -> 81%) */}
            <g>
              <animateMotion
                path="M 400 0 C 400 45, 130 35, 130 80"
                dur="4.2s"
                repeatCount="indefinite"
                keyTimes="0; 0.42; 0.43; 0.81; 0.82; 1"
                keyPoints="0; 0; 0; 1; 1; 1"
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0; 0; 1; 1; 0; 0"
                keyTimes="0; 0.42; 0.44; 0.79; 0.81; 1"
                dur="4.2s"
                repeatCount="indefinite"
              />
              <circle r="5" fill="#38bdf8" filter="url(#glow-particle-bot)" />
              <circle r="2" fill="#ffffff" />
            </g>

            {/* Particule 2 (Centre) - Phase 3 */}
            <g>
              <animateMotion
                path="M 400 0 L 400 80"
                dur="4.2s"
                repeatCount="indefinite"
                keyTimes="0; 0.42; 0.43; 0.81; 0.82; 1"
                keyPoints="0; 0; 0; 1; 1; 1"
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0; 0; 1; 1; 0; 0"
                keyTimes="0; 0.42; 0.44; 0.79; 0.81; 1"
                dur="4.2s"
                repeatCount="indefinite"
              />
              <circle r="5" fill="#38bdf8" filter="url(#glow-particle-bot)" />
              <circle r="2" fill="#ffffff" />
            </g>

            {/* Particule 3 (Droite) - Phase 3 */}
            <g>
              <animateMotion
                path="M 400 0 C 400 45, 670 35, 670 80"
                dur="4.2s"
                repeatCount="indefinite"
                keyTimes="0; 0.42; 0.43; 0.81; 0.82; 1"
                keyPoints="0; 0; 0; 1; 1; 1"
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0; 0; 1; 1; 0; 0"
                keyTimes="0; 0.42; 0.44; 0.79; 0.81; 1"
                dur="4.2s"
                repeatCount="indefinite"
              />
              <circle r="5" fill="#38bdf8" filter="url(#glow-particle-bot)" />
              <circle r="2" fill="#ffffff" />
            </g>
          </svg>
        </div>

        {/* Connecteur vertical mobile (< md) */}
        <div className="md:hidden flex justify-center h-12 w-full relative">
          <div className="w-px h-full border-l border-dashed border-zinc-700/80" />
        </div>

        {/* Étape 3 (Bas) : 3 Serveurs cibles en ligne horizontale sous Sovrack */}
        <div className="z-10 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 w-full max-w-4xl">
          {servers.map((server, serverIdx) => (
            <div
              key={server.name}
              className="rounded-2xl border border-zinc-800 bg-[#121212] p-4 sm:p-5 text-left shadow-xl hover:border-zinc-700 transition"
            >
              {/* Ligne de statut du serveur */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    {server.dots.map((dotColor, dotIdx) => (
                      <span
                        key={dotIdx}
                        className={`h-2 w-2 rounded-full ${dotColor}`}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-xs font-semibold text-zinc-200 whitespace-nowrap truncate">
                    {server.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800/60 border border-zinc-800 shrink-0">
                  {server.tag}
                </span>
              </div>

              <p className="text-[11px] font-mono text-zinc-500 mb-3">
                {server.role}
              </p>

              {/* Égaliseur audio animé en continu (activité temps réel) */}
              <div className="flex items-end gap-[3px] h-4 pt-1">
                {[4, 8, 12, 6, 14, 10, 5, 11, 7, 13, 9, 6, 12, 8, 14, 5].map(
                  (baseHeight, barIdx) => {
                    const animationDelay = `${(barIdx * 0.08 + serverIdx * 0.15).toFixed(2)}s`;
                    const duration = `${(0.7 + (barIdx % 4) * 0.2).toFixed(2)}s`;
                    return (
                      <span
                        key={barIdx}
                        className="w-[3px] rounded-full bg-zinc-600 inline-block transition-all"
                        style={{
                          height: `${baseHeight}px`,
                          animation: `equalizerPulse ${duration} ease-in-out infinite alternate ${animationDelay}`,
                        }}
                      />
                    );
                  },
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Styles keyframes pour pulsation et égaliseur */}
      <style jsx global>{`
        .sovrack-box {
          animation: sovrackOrchestrate 4.2s ease-in-out infinite;
        }
        @keyframes sovrackOrchestrate {
          0%,
          34% {
            box-shadow: 0 0 25px rgba(37, 99, 235, 0.25);
            border-color: #2563eb;
          }
          37%,
          42% {
            box-shadow: 0 0 45px rgba(56, 189, 248, 0.55);
            border-color: #38bdf8;
          }
          46%,
          100% {
            box-shadow: 0 0 25px rgba(37, 99, 235, 0.25);
            border-color: #2563eb;
          }
        }
        @keyframes equalizerPulse {
          0% {
            transform: scaleY(0.4);
            background-color: #52525b;
          }
          50% {
            background-color: #a1a1aa;
          }
          100% {
            transform: scaleY(1.3);
            background-color: #2563eb;
          }
        }
      `}</style>
    </section>
  );
}
