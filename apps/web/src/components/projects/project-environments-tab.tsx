import Link from 'next/link';

type ProjectEnvironmentsTabProps = {
  projectId: string;
};

export function ProjectEnvironmentsTab({ projectId }: ProjectEnvironmentsTabProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Environnements</h3>
      <p className="mt-1 text-sm text-slate-500">
        Gère les environnements (staging, production) du projet.
      </p>
      <Link
        href={`/projects/${projectId}/environments`}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Ouvrir les environnements
      </Link>
    </div>
  );
}
