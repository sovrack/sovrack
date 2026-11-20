import Link from "next/link";
import { FolderGit2, Plus } from "lucide-react";

type ProjectsEmptyProps = {
  canCreate?: boolean;
  onCreate?: () => void;
};

export function ProjectsEmpty({
  canCreate = true,
  onCreate,
}: ProjectsEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-hover/10 py-16 text-center bg-card">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-hover/10 bg-card">
        <FolderGit2
          size={28}
          className="text-secondary text-primary"
        />
      </div>
      <h3 className="mt-4 text-base font-semibold text-primary">
        No projects yet
      </h3>
      <p className="mt-2 max-w-xs text-sm text-secondary">
        {canCreate
          ? "Create your first project and connect it to a GitLab repository to start deploying."
          : "No project is assigned to your account yet. Ask an admin to create or assign one."}
      </p>
      {canCreate &&
        (onCreate ? (
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground  transition hover:bg-accent-hover"
          >
            <Plus size={16} />
            Create Project
          </button>
        ) : (
          <Link
            href="/projects?dialog=create-project"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground  transition hover:bg-accent-hover"
          >
            <Plus size={16} />
            Create Project
          </Link>
        ))}
    </div>
  );
}
