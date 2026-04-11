import clsx from 'clsx';
import { CheckCircle, XCircle, Clock, Ban, Loader2 } from 'lucide-react';
import type { DeploymentStatus } from '@/types/deployment';

const config: Record<DeploymentStatus, { label: string; icon: React.ElementType; cls: string }> = {
  SUCCESS:  { label: 'Success',  icon: CheckCircle, cls: 'bg-emerald-50 text-emerald-700' },
  FAILED:   { label: 'Failed',   icon: XCircle,     cls: 'bg-red-50 text-red-700' },
  RUNNING:  { label: 'Running',  icon: Loader2,     cls: 'bg-blue-50 text-blue-700' },
  PENDING:  { label: 'Pending',  icon: Clock,       cls: 'bg-amber-50 text-amber-700' },
  CANCELED: { label: 'Canceled', icon: Ban,         cls: 'bg-slate-100 text-slate-600' },
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
