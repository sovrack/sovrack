import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card">
          <Icon size={26} className="text-secondary" />
        </div>
      )}
      <h3 className="mt-4 text-base font-semibold text-primary">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm text-secondary">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
