import Link from 'next/link';

type Props = {
  projectId: string;
};

export function ProjectDnsTab({ projectId }: Props) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Domains & routing</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Manage manual DNS records, service domains, and environment routing for this project.
      </p>
      <Link
        href={`/settings/dns?projectId=${projectId}`}
        className="mt-4 inline-flex items-center rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
      >
        Open DNS settings
      </Link>
    </div>
  );
}
