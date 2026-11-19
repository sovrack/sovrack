import { useId } from "react";
import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Taille en pixels (carré). */
  size?: number;
}

/**
 * Logo Sovrack : un oiseau néon (facettes cyan / bleu) qui symbolise
 * "lancer / déployer une application". Lueur néon au survol.
 */
export function SovrackLogo({ size = 32, ...props }: LogoProps) {
  const uid = useId();
  const g1 = `${uid}-grad-cyan-bright`;
  const g2 = `${uid}-grad-cyan-mid`;
  const g3 = `${uid}-grad-blue-dark`;
  const g4 = `${uid}-grad-wing-top`;
  const glow = `${uid}-neon-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <filter id={glow} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <linearGradient id={g1} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#00d8f6" />
        </linearGradient>

        <linearGradient id={g2} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d8f6" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        <linearGradient id={g3} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <linearGradient id={g4} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00e5ff" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#e0f2fe" />
        </linearGradient>
      </defs>

      <g filter={`url(#${glow})`}>
        {/* Plumes de l'aile arrière / supérieure */}
        <polygon points="175,130 255,200 185,170" fill={`url(#${g1})`} />
        <polygon points="180,175 270,225 195,205" fill={`url(#${g2})`} />
        <polygon points="190,210 275,245 210,230" fill={`url(#${g2})`} />
        <polygon points="205,235 270,260 220,250" fill={`url(#${g3})`} />

        {/* Structure principale de l'aile avant */}
        <polygon points="160,110 250,180 270,260 215,220" fill={`url(#${g4})`} />
        <polygon points="250,180 300,250 270,260" fill={`url(#${g2})`} />

        {/* Queue */}
        <polygon points="170,380 235,325 255,300 200,350" fill={`url(#${g4})`} />
        <polygon points="200,385 245,340 260,330" fill={`url(#${g2})`} />

        {/* Corps & Poitrine */}
        <polygon points="270,260 300,250 365,285 300,320 235,325" fill={`url(#${g2})`} />
        <polygon points="300,320 365,285 280,345" fill={`url(#${g3})`} />

        {/* Tête et Bec */}
        <polygon points="300,250 330,245 350,260 320,270" fill={`url(#${g1})`} />
        <polygon points="330,245 385,260 365,285 350,260" fill={`url(#${g4})`} />
        <polygon points="385,260 395,275 380,275 365,285" fill={`url(#${g2})`} />

        {/* Ombre de l'œil */}
        <polygon points="340,258 355,260 345,265" fill="#0b111e" />
      </g>
    </svg>
  );
}

/** Association logo + mot « Sovrack ». */
export function SovrackBrand({
  logoSize = 30,
  className = "",
  textClassName = "",
}: {
  logoSize?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SovrackLogo size={logoSize} />
      <span className={`text-lg font-extrabold tracking-tight ${textClassName}`}>
        Deploy<span className="text-sky-300">Arc</span>
      </span>
    </span>
  );
}
