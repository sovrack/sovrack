'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus,
  Search,
  FolderGit2,
  Link2,
  Workflow,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProjects } from '@/hooks/projects/use-projects';
import { usePagination } from '@/hooks/shared/use-pagination';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/hooks/auth/use-auth';
import { ProjectCard } from '@/components/projects/project-card';
import { ProjectsEmpty } from '@/components/projects/projects-empty';
import { ProjectSetupWizard } from '@/components/projects/project-setup-wizard';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import type { ProjectListItem } from '@/types/project';
import { Alert } from '@/components/ui/alert';

function isProjectGitlabConnected(project: ProjectListItem): boolean {
  const hasGitlabConfig = project.hasGitlabConfig ?? false;
  return hasGitlabConfig;
}

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects, loading, error, refresh } = useProjects();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const { page, totalPages, paged: pagedProjects, goToPage, reset: resetPage } = usePagination(filtered, { pageSize: 12 });

  useEffect(() => { resetPage(); }, [search, resetPage]);

  useEffect(() => {
    if (searchParams.get('dialog') === 'create-project') {
      setCreateDialogOpen(true);
    }
  }, [searchParams]);

  const clearDialogQuery = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has('dialog')) {
      return;
    }

    next.delete('dialog');
    const query = next.toString();
    router.replace(query ? `/projects?${query}` : '/projects');
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    clearDialogQuery();
  };

  const handleWizardCreated = async (projectId: string) => {
    await refresh();
    setCreateDialogOpen(false);
    clearDialogQuery();
    router.push(`/projects/${projectId}`);
  };

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
            {isAdmin && (
              <button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90 text-[var(--bg-app)]"
              >
                <Plus size={16} />
                New Project
              </button>
            )}
          </>
        }
      />

      <SectionCard
        className="overflow-hidden rounded-[28px]"
        contentClassName="!p-0"
      >
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 border-[var(--border)] bg-[var(--bg-card)]">
            <p className="text-xs font-medium text-[var(--text-secondary)] text-[var(--text-secondary)]">Total projects</p>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {projects.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] text-[var(--text-primary)]">
              <Link2 size={14} />
              GitLab connected
            </div>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
              {gitlabConnectedCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 border-[var(--border)] bg-[var(--bg-card)]">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] text-[var(--text-primary)]">
              <Workflow size={14} />
              Ready for deploy
            </div>
            <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
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
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] pl-9 pr-4 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-secondary)] focus:border-[var(--border)] focus:ring-1 focus:ring-zinc-400"
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
              className="animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 border-[var(--border)]"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-[var(--hover)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-[var(--hover)]" />
                  <div className="h-3 w-24 rounded bg-[var(--hover)]" />
                </div>
              </div>
              <div className="mt-4 h-3 w-20 rounded bg-[var(--hover)]" />
              <div className="mt-4 flex gap-4 border-t border-[var(--border)] pt-3 border-[var(--border)]">
                <div className="h-3 w-16 rounded bg-[var(--hover)]" />
                <div className="h-3 w-16 rounded bg-[var(--hover)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && !error && (
        <ProjectsEmpty
          canCreate={isAdmin}
          onCreate={isAdmin ? () => setCreateDialogOpen(true) : undefined}
        />
      )}

      {!loading && projects.length > 0 && filtered.length === 0 && (
        <SectionCard contentClassName="!py-12 text-center" className="border-dashed">
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            No projects match &quot;{search}&quot;
          </p>
          <button
            onClick={() => setSearch('')}
            className="mt-2 text-xs text-[var(--text-secondary)] hover:underline text-[var(--text-secondary)]"
          >
            Clear search
          </button>
        </SectionCard>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <FolderGit2 size={14} className="text-[var(--text-secondary)]" />
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

      <ProjectSetupWizard
        open={createDialogOpen}
        onClose={handleCloseCreateDialog}
        onCreated={(id) => void handleWizardCreated(id)}
      />
    </div>
  );
}
