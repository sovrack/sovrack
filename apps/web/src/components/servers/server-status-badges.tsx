import { CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';

type BadgeProps = { label: string; active: boolean };

function ToolBadge({ label, active }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      {active ? <CheckCircle size={11} /> : <XCircle size={11} />}
      {label}
    </span>
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
