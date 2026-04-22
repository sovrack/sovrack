import Link from 'next/link';

type ProjectConfigsTabProps = {
  projectId: string;
};

export function ProjectConfigsTab({ projectId }: ProjectConfigsTabProps) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Variables de configuration</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Gère les variables d&apos;environnement déployées pour ce projet.
      </p>
      <Link
        href={`/projects/${projectId}/configs`}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
      >
        Ouvrir les configs
      </Link>
    </div>
  );
}
