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
        description="Les builds sont configurés et exécutés par projet."
      />

      <EmptyState
        icon={Hammer}
        title="Pas de vue globale des builds"
        description="Les builds (Dockerfile, .gitlab-ci.yml) sont gérés au niveau de chaque projet. Ouvrez un projet et accédez à l'onglet Build pour configurer la préparation et déclencher un pipeline."
        action={
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
          >
            <FolderGit2 size={14} />
            Voir les projets
          </Link>
        }
      />
    </div>
  );
}
