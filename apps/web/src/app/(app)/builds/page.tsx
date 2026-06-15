'use client';

import Link from 'next/link';
import { FolderGit2, Hammer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export default function BuildsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Builds"
        description="Builds are configured and run per project."
      />

      <EmptyState
        icon={Hammer}
        title="Pas de vue globale des builds"
        description="Builds (Dockerfile, .gitlab-ci.yml) are managed per project. Open a project and go to the Build tab to configure generation and trigger a pipeline."
        action={
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
          >
            <FolderGit2 size={14} />
            View projects
          </Link>
        }
      />
    </div>
  );
}
