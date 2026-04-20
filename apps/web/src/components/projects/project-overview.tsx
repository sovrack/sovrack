import type { ProjectDetail } from '@/types/project';

type ProjectOverviewProps = {
  project: ProjectDetail;
};

export function ProjectOverview({ project }: ProjectOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Members
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          {project.members.length}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Default Branch
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          {project.branch}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Container Port
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          :{project.port}
        </p>
      </div>
    </div>
  );
}
