'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle, XCircle, Rocket, AlertCircle, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { DeployDialog } from '@/features/deployments';
import type { ProjectListItem } from '@/features/projects/types/project';

type ProjectCardProps = {
  project: ProjectListItem;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [deployOpen, setDeployOpen] = useState(false);

  const hasGitlabConfig = project.hasGitlabConfig ?? false;
  const isGitlabConnected = hasGitlabConfig;
  const hasEnv = (project.environmentCount ?? 0) > 0;
  const isReadyToDeploy = isGitlabConnected && hasEnv;
  const memberCount = project.memberCount;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <>
      <div className="group relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--text-primary)]/20 hover:shadow-md">
        {/* Header */}
        <Link href={`/projects/${project.id}`} className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--hover)] text-sm font-bold text-[var(--text-primary)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {project.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {project.description ?? 'No description'}
            </p>
          </div>
          {/* Source badge */}
          <span className={clsx(
            'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            isGitlabConnected
              ? 'bg-green-500/10 text-green-300 border border-green-500/20'
              : 'bg-[var(--hover)] text-[var(--text-muted)] border border-[var(--border)]',
          )}>
            {isGitlabConnected ? <CheckCircle size={10} /> : <XCircle size={10} />}
            {isGitlabConnected ? 'Source OK' : 'No Source'}
          </span>
        </Link>

        {/* Env status */}
        <Link href={`/projects/${project.id}`} className="mt-3 flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">{project.environmentCount} env{project.environmentCount !== 1 ? 's' : ''}</span>
          <span className={clsx(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border',
            isReadyToDeploy
              ? 'bg-green-500/10 text-green-300 border-green-500/20'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/20',
          )}>
            {isReadyToDeploy
              ? <><CheckCircle2 size={10} /> Ready to deploy</>
              : <><AlertCircle size={10} /> {!isGitlabConnected ? 'Source manquante' : 'Env manquant'}</>}
          </span>
        </Link>

        {/* Footer */}
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
          <Link href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
            <Users size={11} />
            {memberCount} membre{memberCount !== 1 ? 's' : ''}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href={`/projects/${project.id}?tab=services`}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] hover:bg-[var(--hover)]">
              Configure
            </Link>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setDeployOpen(true); }}
              disabled={!isReadyToDeploy}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
                isReadyToDeploy
                  ? 'bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90'
                  : 'border border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed',
              )}
            >
              <Rocket size={11} /> Deploy
            </button>
          </div>
        </div>
      </div>

      <DeployDialog
        open={deployOpen}
        projectId={project.id}
        onClose={() => setDeployOpen(false)}
        onCreated={() => { setDeployOpen(false); router.push('/deployments'); }}
      />
    </>
  );
}
