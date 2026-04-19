'use client';

import Link from 'next/link';
import {
  Plus,
  RefreshCw,
  Search,
  FolderGit2,
  Link2,
  Workflow,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProjects } from '@/hooks/useProjects';
import { usePagination } from '@/hooks/usePagination';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/hooks/useAuth';
import { ProjectCard } from '@/components/projects/project-card';
import { ProjectsEmpty } from '@/components/projects/projects-empty';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { ProjectListItem } from '@/types/project';
import { Alert } from '@/components/ui/alert';

function isProjectGitlabConnected(project: ProjectListItem): boolean {
  const hasGitlabConfig = project.hasGitlabConfig ?? false;
  const hasSourceIdentifier =
    typeof project.gitlabId === 'number' ||
    typeof project.gitlabGroupId === 'number';

  return hasGitlabConfig && hasSourceIdentifier;
}

export default function ProjectsPage() {
  const { projects, loading, error, refresh } = useProjects();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const { page, totalPages, paged: pagedProjects, goToPage, reset: resetPage } = usePagination(filtered, { pageSize: 12 });

  useEffect(() => { resetPage(); }, [search, resetPage]);
  const gitlabConnectedCount = projects.filter(isProjectGitlabConnected).length;
  const readyForDeployCount = projects.filter(
    (project) =>
      isProjectGitlabConnected(project) &&
      (project.environmentCount ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Hub"
        title="Projects"
        description="Connect GitLab repositories and manage deployment ownership in one place."
        actions={
          <>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <Link
                href="/projects/new"
                className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-brand-600"
              >
                <Plus size={16} />
                New Project
              </Link>
            )}
          </>
        }
      />

      <SectionCard
        className="overflow-hidden rounded-[28px]"
        contentClassName="!p-0"
      >
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Total projects</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {projects.length}
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
              <Link2 size={14} />
              GitLab connected
            </div>
            <p className="mt-1 text-2xl font-semibold text-blue-800">
              {gitlabConnectedCount}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <Workflow size={14} />
              Ready for deploy
            </div>
            <p className="mt-1 text-2xl font-semibold text-emerald-800">
              {readyForDeployCount}
            </p>
          </div>
        </div>
      </SectionCard>

      {!loading && projects.length > 0 && (
        <SectionCard contentClassName="!p-3">
          <div className="relative max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </SectionCard>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-24 rounded bg-slate-200" />
                </div>
              </div>
              <div className="mt-4 h-3 w-20 rounded bg-slate-200" />
              <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3">
                <div className="h-3 w-16 rounded bg-slate-200" />
                <div className="h-3 w-16 rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && !error && (
        <ProjectsEmpty canCreate={isAdmin} />
      )}

      {!loading && projects.length > 0 && filtered.length === 0 && (
        <SectionCard contentClassName="!py-12 text-center" className="border-dashed">
          <p className="text-sm font-medium text-slate-500">
            No projects match &quot;{search}&quot;
          </p>
          <button
            onClick={() => setSearch('')}
            className="mt-2 text-xs text-brand-600 hover:underline"
          >
            Clear search
          </button>
        </SectionCard>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FolderGit2 size={14} className="text-brand-500" />
            <span>
              {filtered.length} project{filtered.length !== 1 ? 's' : ''} shown
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pagedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </div>
  );
}
