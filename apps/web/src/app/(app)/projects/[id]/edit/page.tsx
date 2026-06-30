"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useProject } from "@/features/projects/api/use-projects";
import {
  ProjectForm,
  type ProjectFormPayload,
} from "@/features/projects/components/project-form";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { projectsService } from "@/features/projects/api/projects.service";
import { getApiErrorMessage } from "@/shared/lib/api";

type EditProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { project, loading } = useProject(id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (payload: ProjectFormPayload) => {
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
        <Loader2
          size={24}
          className="animate-spin text-[var(--text-secondary)]"
        />
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
      <PageHeader
        eyebrow="Projects"
        title="Edit Project"
        description={`Update ${project.name} without changing the current behavior.`}
        actions={
          <Link
            href={`/projects/${id}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft size={15} />
            Back to {project.name}
          </Link>
        }
      />

      <SectionCard title="Project form" contentClassName="p-0">
        <ProjectForm
          initialValues={project}
          onSubmit={handleUpdate}
          submitLabel="Save Changes"
          loading={saving}
          error={error}
          showDeployCap
        />
      </SectionCard>
    </div>
  );
}
