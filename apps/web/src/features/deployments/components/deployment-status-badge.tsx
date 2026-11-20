import clsx from "clsx";
import { CheckCircle, XCircle, Clock, Ban, Loader2 } from "lucide-react";
import type { DeploymentStatus } from "@/features/deployments/types";
import { deploymentStatusLabel } from "@/shared/i18n/product-labels";

// `fill` = badge coloré (listes) · `text` = couleur du texte/icône réutilisée par
// la variante « plain » (fond neutre comme les boutons, juste le texte coloré).
const config: Record<
  DeploymentStatus,
  { label: string; icon: React.ElementType; fill: string; text: string }
> = {
  SUCCESS: {
    label: "SUCCESS",
    icon: CheckCircle,
    fill: "bg-green-500/15",
    text: "text-green-300",
  },
  FAILED: {
    label: "FAILED",
    icon: XCircle,
    fill: "bg-red-500/15",
    text: "text-red-300",
  },
  RUNNING: {
    label: "RUNNING",
    icon: Loader2,
    fill: "bg-accent/15",
    text: "text-secondary",
  },
  PENDING: {
    label: "PENDING",
    icon: Clock,
    fill: "bg-yellow-500/15",
    text: "text-yellow-300",
  },
  CANCELED: {
    label: "CANCELED",
    icon: Ban,
    fill: "bg-muted/15",
    text: "text-secondary",
  },
};

type Props = {
  status: DeploymentStatus;
  size?: "sm" | "md";
  /** 'fill' = pastille colorée (listes) ; 'plain' = fond neutre (barre/boutons). */
  variant?: "fill" | "plain";
};

export function DeploymentStatusBadge({
  status,
  size = "md",
  variant = "fill",
}: Props) {
  const { label, icon: Icon, fill, text } = config[status];
  // 'plain' = même forme/fond que les boutons voisins (rounded-lg, bordure, fond
  // carte) → s'intègre dans la barre/header sans pastille colorée.
  const shape =
    variant === "plain"
      ? "rounded-lg border border-border bg-card px-3 py-2 text-sm"
      : clsx(
          "rounded-md",
          fill,
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        );
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 font-semibold",
        text,
        shape,
      )}
    >
      <Icon
        size={size === "sm" ? 11 : 13}
        className={status === "RUNNING" ? "animate-spin" : ""}
      />
      {deploymentStatusLabel(label)}
    </span>
  );
}
