'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useProject } from '@/hooks/useProjects';
import { ProjectForm } from '@/components/projects/project-form';
import { projectsService } from '@/services/projects.service';
import { getApiErrorMessage } from '@/lib/api';
import type { CreateProjectPayload } from '@/types/project';

type EditProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { project, loading } = useProject(id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (payload: CreateProjectPayload) => {
    setSaving(true);
    setError(null);
    try {
      await projectsService.update(id, payload);
      router.push(`/projects/${id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Project not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          Back to {project.name}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Edit Project</h1>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ProjectForm
          initialValues={project}
          onSubmit={handleUpdate}
          submitLabel="Save Changes"
          loading={saving}
          error={error}
        />
      </div>
    </div>
  );
}
