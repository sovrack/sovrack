'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderGit2 } from 'lucide-react';
import { ProjectForm } from '@/components/projects/project-form';
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
      {/* Header */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-700"
        >
          <ArrowLeft size={15} />
          Back to Projects
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <FolderGit2 size={20} className="text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
            <p className="text-sm text-slate-500">
              Create a project and connect it to a GitLab repository.
            </p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ProjectForm
          onSubmit={handleCreate}
          submitLabel="Create Project"
          loading={loading}
          error={error}
          includeOwnerSelect
          ownerOptions={ownerOptions}
          initialOwnerId={ownerOptions[0]?.id ?? ''}
        />
      </div>

      {/* Tip */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <p className="text-xs font-semibold text-indigo-700">💡 Next steps after creation</p>
        <ul className="mt-2 space-y-1 text-xs text-indigo-600">
          <li>→ Connect your GitLab repository (token + project ID)</li>
          <li>→ Add team members and assign roles</li>
          <li>→ Configure deployment environments (STAGING / PRODUCTION)</li>
          <li>→ Launch your first deployment</li>
        </ul>
      </div>
    </div>
  );
}
