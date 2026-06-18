import clsx from 'clsx';
import { CheckCircle, XCircle, Clock, Ban, Loader2 } from 'lucide-react';
import type { DeploymentStatus } from '@/types/deployment';

// `fill` = badge coloré (listes) · `text` = couleur du texte/icône réutilisée par
// la variante « plain » (fond neutre comme les boutons, juste le texte coloré).
const config: Record<
  DeploymentStatus,
  { label: string; icon: React.ElementType; fill: string; text: string }
> = {
  SUCCESS:  { label: 'Success',  icon: CheckCircle, fill: 'bg-green-500/15',  text: 'text-green-300' },
  FAILED:   { label: 'Failed',   icon: XCircle,     fill: 'bg-red-500/15',    text: 'text-red-300' },
  RUNNING:  { label: 'Running',  icon: Loader2,     fill: 'bg-blue-500/15',   text: 'text-[var(--text-secondary)]' },
  PENDING:  { label: 'Pending',  icon: Clock,       fill: 'bg-yellow-500/15', text: 'text-yellow-300' },
  CANCELED: { label: 'Canceled', icon: Ban,         fill: 'bg-zinc-500/15',   text: 'text-[var(--text-secondary)]' },
};

type Props = {
  status: DeploymentStatus;
  size?: 'sm' | 'md';
  /** 'fill' = pastille colorée (listes) ; 'plain' = fond neutre (barre/boutons). */
  variant?: 'fill' | 'plain';
};

export function DeploymentStatusBadge({ status, size = 'md', variant = 'fill' }: Props) {
  const { label, icon: Icon, fill, text } = config[status];
  const bg =
    variant === 'plain'
      ? 'border border-[var(--border)] bg-[var(--bg-card)]'
      : fill;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-semibold', bg, text,
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
    )}>
      <Icon size={size === 'sm' ? 11 : 13} className={status === 'RUNNING' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}
