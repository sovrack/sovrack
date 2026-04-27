import { CheckCircle, CircleDashed } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/badge';
import type { Server, ServerStatus } from '@/types/server';

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
      {active ? <CheckCircle size={11} /> : <CircleDashed size={11} />}
      {label}
    </span>
  );
}

type ServerOverallStatus = {
  label: string;
  description: string;
  tone: 'default' | 'success' | 'warning' | 'error' | 'info';
};

export function getServerOverallStatus(server: Pick<Server, 'isActive' | 'status' | 'isVerified' | 'hasDocker' | 'hasRunner'>): ServerOverallStatus {
  if (!server.isActive || server.status === 'DISABLED') {
    return {
      label: 'Disabled',
      description: 'Server disabled by admin',
      tone: 'default',
    };
  }

  if (server.status === 'PREPARED') {
    return {
      label: 'Ready',
      description: 'Prepared from the control node with Ansible',
      tone: 'success',
    };
  }

  if (server.status === 'PARTIALLY_PREPARED') {
    return {
      label: 'Partial',
      description: 'Some preparation roles require attention',
      tone: 'warning',
    };
  }

  if (server.status === 'VALIDATION_FAILED') {
    return {
      label: 'SSH validation failed',
      description: 'SSH or sudo check failed — re-run Validate SSH',
      tone: 'error',
    };
  }

  if (server.status === 'PREPARATION_FAILED') {
    return {
      label: 'Preparation failed',
      description: 'Ansible preparation failed — view logs and retry',
      tone: 'error',
    };
  }

  if (server.status === 'UNREACHABLE') {
    return {
      label: 'Unreachable',
      description: 'Server is unreachable — check IP address and SSH credentials',
      tone: 'error',
    };
  }

  if (server.status === 'PREPARING' || server.status === 'PREPARATION_PENDING') {
    return {
      label: 'Preparing',
      description: 'Preparation job is running or queued',
      tone: 'info',
    };
  }

  if (server.status === 'INFO_DETECTED') {
    return {
      label: 'Detected',
      description: 'Ready to choose preparation options',
      tone: 'info',
    };
  }

  if (server.status === 'SSH_VALIDATED' || server.isVerified) {
    return {
      label: 'SSH validated',
      description: 'Next step: detect server information',
      tone: 'info',
    };
  }

  return {
    label: 'Needs validation',
    description: 'SSH connection has not been validated yet',
    tone: 'warning',
  };
}

export function ServerOverallStatusBadge({ server }: { server: Server }) {
  const status = getServerOverallStatus(server);

  return (
    <div className="space-y-1">
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
      <p className="text-[11px] text-[var(--text-secondary)]">{status.description}</p>
    </div>
  );
}

export function ServerWorkflowBadges({ server }: { server: Server }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToolBadge label="SSH" active={server.isVerified} />
      <ToolBadge label="Docker" active={server.hasDocker} />
      <ToolBadge label="Runner" active={server.hasRunner} />
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-300">
        <CheckCircle size={11} /> Managed by control-node Ansible
      </span>
    </div>
  );
}

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const label = status.replace(/_/g, ' ');
  if (status.includes('FAILED') || status === 'UNREACHABLE') {
    return <Badge tone="error">{label}</Badge>;
  }
  if (status === 'PREPARED') {
    return <Badge tone="success">{label}</Badge>;
  }
  if (status === 'PREPARING' || status === 'SSH_PENDING') {
    return <Badge tone="info">{label}</Badge>;
  }
  return <Badge tone="default">{label}</Badge>;
}
