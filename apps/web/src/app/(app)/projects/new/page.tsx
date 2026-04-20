'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectForm } from '@/components/projects/project-form';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { projectsService } from '@/services/projects.service';
import { usersService } from '@/services/users.service';
import { getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { CreateProjectPayload } from '@/types/project';
import type { UserListItem } from '@/types/user';

export default function NewProjectPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [developers, setDevelopers] = useState<UserListItem[]>([]);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/access-denied');
    }
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) {
      setUsersLoading(false);
      return;
    }

    const loadUsers = async () => {
      setUsersLoading(true);
      setError(null);
      try {
        const users = await usersService.getAll();
        setDevelopers(
          users.filter((user) => user.role === 'DEVELOPER' && user.isActive),
        );
      } catch (fetchError) {
        setError(getApiErrorMessage(fetchError));
      } finally {
        setUsersLoading(false);
      }
    };

    void loadUsers();
  }, [isAdmin]);

  const ownerOptions = useMemo(() => developers, [developers]);

  const handleCreate = async (payload: CreateProjectPayload) => {
    setLoading(true);
    setError(null);
    try {
      const project = await projectsService.create(payload);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || (!isAdmin && !authLoading) || usersLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="New Project"
        description="Create a project and connect it to a GitLab repository."
        actions={
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
          >
            <ArrowLeft size={15} />
            Back to Projects
          </Link>
        }
      />

      <SectionCard
        title="Project form"
        description="Configure ownership, repository details, and deployment defaults."
        contentClassName="p-0"
      >
        <ProjectForm
          onSubmit={handleCreate}
          submitLabel="Create Project"
          loading={loading}
          error={error}
          includeOwnerSelect
          ownerOptions={ownerOptions}
          initialOwnerId={ownerOptions[0]?.id ?? ''}
        />
      </SectionCard>

      <SectionCard title="Next steps" contentClassName="bg-indigo-50/60 dark:bg-indigo-950/20">
        <div className="space-y-2 text-sm text-indigo-700 dark:text-indigo-300">
          <p>Connect your GitLab repository with a token and project ID.</p>
          <p>Add team members and assign roles.</p>
          <p>Configure deployment environments for STAGING and PRODUCTION.</p>
          <p>Launch your first deployment.</p>
        </div>
      </SectionCard>
    </div>
  );
}
