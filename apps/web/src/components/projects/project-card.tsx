'use client';

import Link from 'next/link';
import { FolderGit2, Users, Rocket, GitBranch, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { Project } from '@/types/project';

type ProjectCardProps = {
  project: Project;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const isGitlabConnected = Boolean(project.gitlabConfig);
  const ownerMember = project.members.find((m) => m.role === 'OWNER');
  const memberCount = project.members.length;
  const deployCount = project._count?.deployments ?? 0;

  // First letter of project name for the avatar
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <Link href={`/projects/${project.id}`}>
      <div className="group relative flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-sm font-bold text-white shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
              {project.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {project.description ?? 'No description'}
            </p>
          </div>

          {/* GitLab badge */}
          <span
            className={clsx(
              'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              isGitlabConnected
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500',
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
        {project.defaultBranch && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <GitBranch size={12} />
            <span className="font-mono">{project.defaultBranch}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Users size={12} className="text-slate-400" />
            <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Rocket size={12} className="text-slate-400" />
            <span>{deployCount} deploy{deployCount !== 1 ? 's' : ''}</span>
          </div>
          {ownerMember && (
            <div className="ml-auto text-xs text-slate-400">
              Owner: <span className="font-medium text-slate-600">{ownerMember.user.fullName}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
