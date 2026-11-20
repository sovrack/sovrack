import { useId } from "react";
import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Taille en pixels (carré). */
  size?: number;
}

/**
 * Logo Sovrack : Bouclier souverain et 3 baies serveurs formant un « S ».
 * Symbolise l'infrastructure maîtrisée, la sécurité et la souveraineté.
 */
export function SovrackLogo({ size = 32, className = "", ...props }: LogoProps) {
  const uid = useId();
  const shieldGrad = `${uid}-shieldGrad`;
  const accentGrad = `${uid}-accentGrad`;
  const goldGrad = `${uid}-goldGrad`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={shieldGrad} x1="24" y1="20" x2="96" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id={accentGrad} x1="30" y1="30" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={goldGrad} x1="40" y1="30" x2="80" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* Container discret */}
      <rect width="120" height="120" rx="28" fill="#090D16" />

      {/* Contour bouclier souverain */}
      <path
        d="M60 18 L94 30 V58 C94 80 60 98 60 98 C60 98 26 80 26 58 V30 Z"
        fill={`url(#${shieldGrad})`}
        stroke="#334155"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Étage supérieur de la baie (haut du 'S') */}
      <rect x="38" y="36" width="44" height="10" rx="3" fill="#1E293B" stroke="#475569" strokeWidth="1" />
      <circle cx="44" cy="41" r="2" fill="#10B981" />
      <circle cx="50" cy="41" r="2" fill="#64748B" />
      <rect x="68" y="39" width="10" height="4" rx="1" fill="#10B981" opacity="0.8" />

      {/* Étage central avec nœud souverain (colonne du 'S') */}
      <rect x="38" y="52" width="44" height="10" rx="3" fill="#0F172A" stroke="#10B981" strokeWidth="1.5" />
      <circle cx="44" cy="57" r="2" fill="#F59E0B" />
      <circle cx="50" cy="57" r="2" fill="#10B981" />
      <path d="M62 55 L74 57 L62 59 Z" fill="#10B981" />

      {/* Étage inférieur de la baie (base du 'S') */}
      <rect x="38" y="68" width="44" height="10" rx="3" fill="#1E293B" stroke="#475569" strokeWidth="1" />
      <circle cx="44" cy="73" r="2" fill="#10B981" />
      <circle cx="50" cy="73" r="2" fill="#64748B" />
      <rect x="60" y="71" width="18" height="4" rx="1" fill="#334155" />
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
        Sov<span className="text-sky-300">rack</span>
      </span>
    </span>
  );
}
