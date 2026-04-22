import clsx from 'clsx';
import { CheckCircle, XCircle, Clock, Ban, Loader2 } from 'lucide-react';
import type { DeploymentStatus } from '@/types/deployment';

const config: Record<DeploymentStatus, { label: string; icon: React.ElementType; cls: string }> = {
  SUCCESS:  { label: 'Success',  icon: CheckCircle, cls: 'bg-green-500/15 text-green-300' },
  FAILED:   { label: 'Failed',   icon: XCircle,     cls: 'bg-red-500/15 text-red-300' },
  RUNNING:  { label: 'Running',  icon: Loader2,     cls: 'bg-[var(--text-primary)]/15 text-[var(--text-secondary)]' },
  PENDING:  { label: 'Pending',  icon: Clock,       cls: 'bg-yellow-500/15 text-yellow-300' },
  CANCELED: { label: 'Canceled', icon: Ban,         cls: 'bg-[var(--bg-card)]/10 text-[var(--text-primary)]' },
};

type Props = { status: DeploymentStatus; size?: 'sm' | 'md' };

export function DeploymentStatusBadge({ status, size = 'md' }: Props) {
  const { label, icon: Icon, cls } = config[status];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full font-semibold', cls,
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
    )}>
      <Icon size={size === 'sm' ? 11 : 13} className={status === 'RUNNING' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}
