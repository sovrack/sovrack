'use client';

import Link from 'next/link';
import { Users, GitBranch, CheckCircle, XCircle, Rocket } from 'lucide-react';
import clsx from 'clsx';
import type { ProjectListItem } from '@/types/project';

type ProjectCardProps = {
  project: ProjectListItem;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const hasGitlabConfig = project.hasGitlabConfig ?? false;
  const hasGitlabSourceId =
    typeof project.gitlabId === 'number' ||
    typeof project.gitlabGroupId === 'number';
  const isGitlabConnected = hasGitlabConfig && hasGitlabSourceId;
  const memberCount = project.memberCount;

  // First letter of project name for the avatar
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group relative flex flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--border)] border-[var(--border)] bg-[var(--bg-card)]">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-card)] text-sm font-bold text-[var(--bg-app)] shadow-sm bg-[var(--bg-card)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--text-primary)] text-[var(--text-primary)]">
              {project.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {project.description ?? 'No description'}
            </p>
          </div>

          {/* GitLab badge */}
          <span
            className={clsx(
              'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              isGitlabConnected
                ? 'bg-[var(--hover)] text-[var(--text-secondary)] text-[var(--text-primary)]'
                : 'bg-[var(--hover)] text-[var(--text-secondary)] text-[var(--text-secondary)]',
            )}
          >
            {isGitlabConnected ? (
              <CheckCircle size={10} />
            ) : (
              <XCircle size={10} />
            )}
            {isGitlabConnected ? 'GitLab' : 'No GitLab'}
          </span>
        </div>

        {/* Branch info */}
        {project.branch && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <GitBranch size={12} />
            <span className="font-mono">{project.branch}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="mt-4 flex items-center gap-4 border-t border-[var(--border)] pt-3 border-[var(--border)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Users size={12} className="text-[var(--text-secondary)]" />
            <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Rocket size={12} className="text-[var(--text-secondary)]" />
            <span className="font-mono">:{project.port}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
