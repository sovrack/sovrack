'use client';

import { Rocket, CheckCircle, XCircle, Clock, Ban, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

export type DeploymentStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELED';

export type RecentDeployment = {
  id: string;
  projectName: string;
  branch: string;
  environment: string;
  status: DeploymentStatus;
  createdAt: string;
};

const statusConfig: Record<
  DeploymentStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  SUCCESS: {
    label: 'Success',
    icon: CheckCircle,
    className: 'bg-emerald-50 text-emerald-700',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-50 text-red-700',
  },
  RUNNING: {
    label: 'Running',
    icon: RefreshCw,
    className: 'bg-blue-50 text-blue-700',
  },
  PENDING: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700',
  },
  CANCELED: {
    label: 'Canceled',
    icon: Ban,
    className: 'bg-slate-100 text-slate-600',
  },
};

function StatusBadge({ status }: { status: DeploymentStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        config.className,
      )}
    >
      <Icon size={12} className={status === 'RUNNING' ? 'animate-spin' : ''} />
      {config.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

type RecentDeploymentsProps = {
  deployments: RecentDeployment[];
  loading?: boolean;
};

export function RecentDeployments({ deployments, loading }: RecentDeploymentsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 animate-pulse">
            <div className="h-8 w-8 rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-slate-200" />
              <div className="h-2.5 w-20 rounded bg-slate-200" />
            </div>
            <div className="h-6 w-16 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Rocket size={32} className="text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">No deployments yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Create a project and launch your first deployment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deployments.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-200 hover:shadow-sm"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
            <Rocket size={16} className="text-indigo-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {d.projectName}
            </p>
            <p className="text-xs text-slate-400">
              <span className="font-mono">{d.branch}</span>
              {' · '}
              <span className="uppercase">{d.environment}</span>
              {' · '}
              {timeAgo(d.createdAt)}
            </p>
          </div>
          <StatusBadge status={d.status} />
        </div>
      ))}
    </div>
  );
}
