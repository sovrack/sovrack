import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
};

const variantMap: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-60",
  secondary:
    "border border-border bg-card text-primary hover:bg-hover/10 disabled:opacity-60",
  ghost:
    "text-secondary hover:bg-hover/10 hover:text-primary disabled:opacity-60",
  danger:
    "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15 disabled:opacity-60",
};

const sizeMap: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-10 px-5 text-sm gap-2 rounded-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  // Défaut sûr : un <Button> sans type n'est jamais un submit implicite (évite
  // les soumissions de formulaire accidentelles). Les vrais submit passent type="submit".
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        variantMap[variant],
        sizeMap[size],
        className,
      )}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
