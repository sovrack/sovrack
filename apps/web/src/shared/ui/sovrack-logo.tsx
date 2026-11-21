interface LogoProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export function SovrackLogo({ className = "w-7 h-7", width, height }: LogoProps) {
  return (
    <svg
      viewBox="26 22 48 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={width || 28}
      height={height || 28}
      aria-label="Sovrack Logo"
      role="img"
    >
      <polygon
        points="50,24 68,24 62.5,33.5 54,33.5 41.5,46 44.5,49 39.5,57.5 28,46"
        fill="currentColor"
      />
      <polygon
        points="54.5,36.5 60.5,36.5 45.5,63.5 39.5,63.5"
        fill="#2563EB"
      />
      <polygon
        points="50,76 32,76 37.5,66.5 46,66.5 58.5,54 55.5,51 60.5,42.5 72,54"
        fill="currentColor"
      />
    </svg>
  );
}

interface BrandProps {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
}

export function SovrackBrand({
  className = "",
  logoClassName = "w-7 h-7 text-white",
  textClassName = "",
}: BrandProps) {
  return (
    <span className={`inline-flex select-none items-center gap-2.5 ${className}`}>
      <SovrackLogo className={`shrink-0 ${logoClassName}`} width={28} height={28} />
      <span
        className={`text-[22px] font-bold tracking-tight text-white antialiased ${textClassName}`}
      >
        sovrack
      </span>
    </span>
  );
}
