"use client";

import { GitBranch, GitCommit } from "lucide-react";

export function HowItWorksInteractive() {
  const servers = [
    { name: "vps-production", dots: ["bg-emerald-400", "bg-emerald-400"] },
    { name: "vps-staging", dots: ["bg-emerald-400", "bg-amber-400"] },
    { name: "serveur-dedie", dots: ["bg-emerald-400", "bg-emerald-400"] },
  ];

  return (
    <section className="py-20 sm:py-28 text-center">
      {/* En-tête de section style Coolify (Photo 4) */}
      <div className="max-w-2xl mx-auto mb-16 sm:mb-20 px-4">
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

      {/* Diagramme sans cadre (exactement comme la Photo 4) */}
      <div className="relative max-w-[1000px] mx-auto px-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-10 lg:gap-4 relative min-h-[320px]">
          {/* Bloc 1 : git push (Gauche) */}
          <div className="z-10 shrink-0">
            <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-[#121212] px-6 py-4 shadow-xl">
              <GitBranch size={22} className="text-zinc-300" strokeWidth={2} />
              <span className="font-mono text-base font-medium text-white tracking-wide">
                git push
              </span>
            </div>
          </div>

          {/* Ligne connectrice gauche avec point animé qui avance */}
          <div className="hidden lg:flex flex-1 items-center justify-center relative h-10 px-2">
            <div className="w-full border-t border-dashed border-zinc-700/80" />
            {/* Particule lumineuse automatique */}
            <span
              className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_12px_#fbbf24] animate-[travelRight_2.4s_cubic-bezier(0.4,0,0.6,1)_infinite]"
            />
          </div>

          {/* Bloc 2 : Sovrack (Centre) avec halo bleu électrique */}
          <div className="z-10 shrink-0 relative">
            <div className="absolute inset-0 rounded-2xl bg-[#2563EB]/25 blur-2xl -z-10 animate-pulse" />
            <div className="rounded-2xl border-2 border-[#2563EB] bg-[#121212] px-10 py-6 text-center shadow-[0_0_35px_rgba(37,99,235,0.35)] min-w-[210px]">
              <h3 className="text-xl font-bold tracking-tight text-white">
                Sovrack
              </h3>
              <p className="mt-1 text-xs font-mono text-zinc-400 tracking-wider">
                build · deploy · proxy
              </p>
            </div>
          </div>

          {/* Connecteur droit avec 3 branches vers les serveurs */}
          <div className="hidden lg:flex flex-1 items-center justify-center relative h-64 px-2">
            <svg
              className="w-full h-full overflow-visible pointer-events-none"
              viewBox="0 0 160 220"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Ligne vers serveur 1 (haut) */}
              <path
                d="M 0 110 C 60 110, 80 35, 160 35"
                stroke="#3f3f46"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              {/* Ligne vers serveur 2 (milieu) */}
              <path
                d="M 0 110 L 160 110"
                stroke="#3f3f46"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              {/* Ligne vers serveur 3 (bas) */}
              <path
                d="M 0 110 C 60 110, 80 185, 160 185"
                stroke="#3f3f46"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* Point lumineux animé 1 */}
              <circle r="4" fill="#fbbf24" className="shadow-[0_0_10px_#fbbf24]">
                <animateMotion
                  path="M 0 110 C 60 110, 80 35, 160 35"
                  dur="2.4s"
                  repeatCount="indefinite"
                  begin="0.6s"
                />
              </circle>
              {/* Point lumineux animé 2 */}
              <circle r="4" fill="#fbbf24" className="shadow-[0_0_10px_#fbbf24]">
                <animateMotion
                  path="M 0 110 L 160 110"
                  dur="2.4s"
                  repeatCount="indefinite"
                  begin="0.8s"
                />
              </circle>
              {/* Point lumineux animé 3 */}
              <circle r="4" fill="#fbbf24" className="shadow-[0_0_10px_#fbbf24]">
                <animateMotion
                  path="M 0 110 C 60 110, 80 185, 160 185"
                  dur="2.4s"
                  repeatCount="indefinite"
                  begin="1s"
                />
              </circle>
            </svg>
          </div>

          {/* Bloc 3 : Serveurs cibles avec égaliseur audio automatique (Droite) */}
          <div className="z-10 flex flex-col gap-3.5 w-full sm:w-[260px] shrink-0">
            {servers.map((server, serverIdx) => (
              <div
                key={server.name}
                className="rounded-2xl border border-zinc-800 bg-[#121212] p-4 text-left shadow-lg hover:border-zinc-700 transition"
              >
                {/* Ligne de titre avec les deux points de statut */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center gap-1">
                    {server.dots.map((dotColor, dotIdx) => (
                      <span
                        key={dotIdx}
                        className={`h-2 w-2 rounded-full ${dotColor}`}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-xs font-medium text-zinc-200">
                    {server.name}
                  </span>
                </div>

                {/* Égaliseur audio animé en continu comme sur Coolify (Photo 4) */}
                <div className="flex items-end gap-[3px] h-4 pt-1">
                  {[4, 8, 12, 6, 14, 10, 5, 11, 7, 13, 9, 6, 12, 8, 14, 5].map(
                    (baseHeight, barIdx) => {
                      const animationDelay = `${(barIdx * 0.1 + serverIdx * 0.2).toFixed(2)}s`;
                      const duration = `${(0.8 + (barIdx % 4) * 0.2).toFixed(2)}s`;
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
      </div>

      {/* Styles keyframes pour les animations fluides sans bibliothèque externe */}
      <style jsx global>{`
        @keyframes travelRight {
          0% {
            left: 0%;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            left: 100%;
            opacity: 0;
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
