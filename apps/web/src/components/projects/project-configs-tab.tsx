import Link from 'next/link';

type ProjectConfigsTabProps = {
  projectId: string;
};

export function ProjectConfigsTab({ projectId }: ProjectConfigsTabProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Variables de configuration</h3>
      <p className="mt-1 text-sm text-slate-500">
        Gère les variables d&apos;environnement déployées pour ce projet.
      </p>
      <Link
        href={`/projects/${projectId}/configs`}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Ouvrir les configs
      </Link>
    </div>
  );
}
