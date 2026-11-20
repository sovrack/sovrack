import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Taille en pixels (carré). */
  size?: number;
  /** Afficher le fond sombre rectangulaire arrondi ou le glyphe pur transparent. */
  withBackground?: boolean;
}

/**
 * Logo officiel Sovrack : Le glyphe géométrique « S » avec barre centrale bleue oblique.
 * Conçu avec une symétrie 180° parfaite, représentant la précision, la puissance et la souveraineté.
 */
export function SovrackLogo({
  size = 32,
  withBackground = true,
  className = "",
  ...props
}: LogoProps) {
  if (withBackground) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 1024 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
        {...props}
      >
        <rect width="1024" height="1024" rx="200" fill="#0B0D13" />
        <polygon
          points="699,250 517,250 288,472 406,581 459,495 428,465 553,346 639,346"
          fill="#FFFFFF"
        />
        <polygon
          points="621,375 565,375 406,638 463,637"
          fill="#2D7AE5"
        />
        <polygon
          points="736,549 616,440 564,525 594,555 476,667 389,667 324,773 500,773"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="260 220 504 584"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <polygon
        points="699,250 517,250 288,472 406,581 459,495 428,465 553,346 639,346"
        fill="#FFFFFF"
      />
      <polygon
        points="621,375 565,375 406,638 463,637"
        fill="#2D7AE5"
      />
      <polygon
        points="736,549 616,440 564,525 594,555 476,667 389,667 324,773 500,773"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/** Wordmark & Identité officielle Sovrack. */
export function SovrackBrand({
  logoSize = 32,
  className = "",
  textClassName = "",
}: {
  logoSize?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <SovrackLogo size={logoSize} />
      <span
        className={`text-[19px] font-bold tracking-[-0.03em] text-white antialiased ${textClassName}`}
      >
        Sovrack
      </span>
    </span>
  );
}
