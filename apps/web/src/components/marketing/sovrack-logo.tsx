import type { SVGProps } from "react";

export interface LogoProps extends SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
  withBackground?: boolean;
}

/**
 * Logo officiel Sovrack : Le glyphe géométrique « S » avec barre centrale bleue oblique.
 * Respecte à 100% le SVG vectoriel officiel Sovrack.
 */
export function SovrackLogo({
  className = "w-8 h-8",
  size,
  withBackground = false,
  ...props
}: LogoProps) {
  const style = size
    ? { width: size, height: size, ...props.style }
    : props.style;

  if (withBackground) {
    return (
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={style}
        aria-label="Sovrack Logo"
        {...props}
      >
        {/* Fond sombre squircle arrondi */}
        <rect width="100" height="100" rx="22" fill="#0B0D13" />
        {/* Partie supérieure */}
        <polygon
          points="50,24 68,24 62.5,33.5 54,33.5 41.5,46 44.5,49 39.5,57.5 28,46"
          fill="#FFFFFF"
        />
        {/* Barre centrale bleue */}
        <polygon
          points="54.5,36.5 60.5,36.5 45.5,63.5 39.5,63.5"
          fill="#2563EB"
        />
        {/* Partie inférieure */}
        <polygon
          points="50,76 32,76 37.5,66.5 46,66.5 58.5,54 55.5,51 60.5,42.5 72,54"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Sovrack Logo"
      {...props}
    >
      {/* Partie supérieure */}
      <polygon
        points="50,24 68,24 62.5,33.5 54,33.5 41.5,46 44.5,49 39.5,57.5 28,46"
        fill="currentColor"
      />
      {/* Barre centrale bleue */}
      <polygon
        points="54.5,36.5 60.5,36.5 45.5,63.5 39.5,63.5"
        fill="#2563EB"
      />
      {/* Partie inférieure */}
      <polygon
        points="50,76 32,76 37.5,66.5 46,66.5 58.5,54 55.5,51 60.5,42.5 72,54"
        fill="currentColor"
      />
    </svg>
  );
}

/** Wordmark & Identité officielle Sovrack. */
export function SovrackBrand({
  logoSize,
  className = "",
  logoClassName = "w-8 h-8 text-white",
  textClassName = "",
  withBackground = false,
}: {
  logoSize?: number;
  className?: string;
  logoClassName?: string;
  textClassName?: string;
  withBackground?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <SovrackLogo
        size={logoSize}
        className={logoClassName}
        withBackground={withBackground}
      />
      <span
        className={`text-[19px] font-bold tracking-[-0.03em] text-white antialiased ${textClassName}`}
      >
        Sovrack
      </span>
    </span>
  );
}
