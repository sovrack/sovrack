import Link from 'next/link';
import { FolderGit2, Plus } from 'lucide-react';

export function ProjectsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
        <FolderGit2 size={28} className="text-indigo-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">No projects yet</h3>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Create your first project and connect it to a GitLab repository to start deploying.
      </p>
      <Link
        href="/projects/new"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-indigo-700"
      >
        <Plus size={16} />
        Create Project
      </Link>
    </div>
  );
}
