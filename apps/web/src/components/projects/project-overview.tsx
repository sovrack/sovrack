import type { ProjectDetail } from '@/types/project';

type ProjectOverviewProps = {
  project: ProjectDetail;
};

export function ProjectOverview({ project }: ProjectOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Members
        </p>
        <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
          {project.members.length}
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Default Branch
        </p>
        <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
          {project.branch}
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Container Port
        </p>
        <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
          :{project.port}
        </p>
      </div>
    </div>
  );
}
