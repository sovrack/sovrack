import { CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/badge';

type BadgeProps = { label: string; active: boolean };

function ToolBadge({ label, active }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        active
          ? 'border border-green-500/20 bg-green-500/10 text-green-400'
          : 'border border-zinc-500/20 bg-[var(--text-primary)]/10 text-[var(--text-muted)]',
      )}
    >
      {active ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  );
}

type ServerOverallStatus = {
  label: string;
  description: string;
  tone: 'default' | 'success' | 'warning' | 'error' | 'info';
};

export function getServerOverallStatus({
  isActive,
  isVerified,
  hasDocker,
  hasAnsible,
  hasRunner,
}: {
  isActive: boolean;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
}): ServerOverallStatus {
  if (!isActive) {
    return {
      label: 'Disabled',
      description: 'Server disabled by admin',
      tone: 'default',
    };
  }

  const score = [isVerified, hasDocker, hasAnsible, hasRunner].filter(Boolean)
    .length;

  if (score === 4) {
    return {
      label: 'Ready',
      description: 'SSH + Docker + Ansible + Runner',
      tone: 'success',
    };
  }

  if (!isVerified) {
    return {
      label: 'Unverified',
      description: 'SSH connectivity not validated',
      tone: 'error',
    };
  }

  return {
    label: `Partial ${score}/4`,
    description: 'Some deployment tools are still missing',
    tone: 'warning',
  };
}

type ServerOverallStatusBadgeProps = {
  isActive: boolean;
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

export function ServerOverallStatusBadge({
  isActive,
  isVerified,
  hasDocker,
  hasAnsible,
  hasRunner,
}: ServerOverallStatusBadgeProps) {
  const status = getServerOverallStatus({
    isActive,
    isVerified,
    hasDocker,
    hasAnsible,
    hasRunner,
  });

  return (
    <div className="space-y-1">
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
      <p className="text-[11px] text-[var(--text-secondary)]">{status.description}</p>
    </div>
  );
}

type ServerStatusBadgesProps = {
  isVerified: boolean;
  hasDocker: boolean;
  hasAnsible: boolean;
  hasRunner: boolean;
};

export function ServerStatusBadges({
  isVerified,
  hasDocker,
  hasAnsible,
  hasRunner,
}: ServerStatusBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToolBadge label="SSH" active={isVerified} />
      <ToolBadge label="Docker" active={hasDocker} />
      <ToolBadge label="Ansible" active={hasAnsible} />
      <ToolBadge label="Runner" active={hasRunner} />
    </div>
  );
}
