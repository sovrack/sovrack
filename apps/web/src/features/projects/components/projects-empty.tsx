import Link from 'next/link';
import { FolderGit2, Plus } from 'lucide-react';

type ProjectsEmptyProps = {
  canCreate?: boolean;
  onCreate?: () => void;
};

export function ProjectsEmpty({
  canCreate = true,
  onCreate,
}: ProjectsEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--hover)] py-16 text-center bg-[var(--bg-card)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--hover)] bg-[var(--bg-card)]">
        <FolderGit2 size={28} className="text-[var(--text-secondary)] text-[var(--text-primary)]" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)]">No projects yet</h3>
      <p className="mt-2 max-w-xs text-sm text-[var(--text-secondary)]">
        {canCreate
          ? 'Create your first project and connect it to a GitLab repository to start deploying.'
          : 'No project is assigned to your account yet. Ask an admin to create or assign one.'}
      </p>
      {canCreate && (
        onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
          >
            <Plus size={16} />
            Create Project
          </button>
        ) : (
          <Link
            href="/projects?dialog=create-project"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] shadow transition hover:opacity-90"
          >
            <Plus size={16} />
            Create Project
          </Link>
        )
      )}
    </div>
  );
}
