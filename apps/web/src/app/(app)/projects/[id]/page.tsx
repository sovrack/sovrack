'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  Database,
  FolderGit2,
  Layers,
  Loader2,
  Package,
  Plus,
  Rocket,
  Settings,
} from 'lucide-react';
import { useAuth } from '@/features/auth/api/use-auth';
import { useProject } from '@/features/projects/api/use-projects';
import { useProjectServices } from '@/features/projects/api/use-project-services';
import { useProjectEnvironments } from '@/features/projects/api/use-project-environments';
import { useProjectMembers } from '@/features/projects/api/use-project-members';
import { useConfirm } from '@/shared/contexts/confirm-context';
import { PageHeader } from '@/shared/layout/page-header';
import { Modal } from '@/shared/ui/modal';
import { ProjectEnvironmentsTab } from '@/features/projects/components/project-environments-tab';
import { ServicesList } from '@/features/projects/components/tabs/service/services-list';
import { AddServiceWizard } from '@/features/projects/components/add-service-wizard';
import type { ServiceKind } from '@/features/projects/components/add-service-wizard.catalog';
import { ProjectMembersTab } from '@/features/projects/components/project-members-tab';
import { getApiErrorMessage } from '@/shared/lib/api';
import { projectsService } from '@/features/projects/api/projects.service';

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

/** Types proposés par le dropdown « Create Service » (style Dokploy). */
const CREATE_ITEMS: {
  kind: ServiceKind;
  label: string;
  icon: React.ReactNode;
  // Disabled until the deploy executor can expand a compose stack into multiple
  // containers — see add-service-wizard.catalog (same rationale).
  disabled?: boolean;
}[] = [
  { kind: 'APPLICATION', label: 'Application', icon: <FolderGit2 size={15} /> },
  { kind: 'DATABASE', label: 'Database', icon: <Database size={15} /> },
  { kind: 'COMPOSE', label: 'Compose', icon: <Layers size={15} />, disabled: true },
  { kind: 'TEMPLATE', label: 'Template', icon: <Package size={15} /> },
];

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { project, loading, error, refresh } = useProject(id);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addServiceKind, setAddServiceKind] = useState<ServiceKind | undefined>(undefined);
  const [envOpen, setEnvOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const members = useProjectMembers({ projectId: id, isAdmin, refreshProject: refresh });
  const servicesQuery = useProjectServices(id);
  const environmentsQuery = useProjectEnvironments(id);
  const environments = environmentsQuery.data ?? [];
  const confirm = useConfirm();

  const openCreate = (kind?: ServiceKind) => {
    setAddServiceKind(kind);
    setAddServiceOpen(true);
    setCreateMenuOpen(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${project?.name}"?`,
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete project',
      variant: 'danger',
    });
    if (!ok) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await projectsService.remove(id);
      router.push('/projects');
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
      setDeleteLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-[var(--text-secondary)]" />
    </div>
  );

  if (error || !project) return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
      {error ?? 'Project not found.'}
      <div className="mt-3">
        <Link href="/projects" className="text-xs text-red-300 underline">Back to Projects</Link>
      </div>
    </div>
  );

  const currentMember = project.members.find((m) => m.user.id === user?.id);
  const isOwner = isAdmin || currentMember?.role === 'OWNER';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description={project.description ?? 'No description'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/projects"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
              <ArrowLeft size={15} /> Projects
            </Link>

            {/* Déploiements PAR PROJET (console filtrée) */}
            <Link href={`/deployments?project=${id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
              <Rocket size={15} /> Deployments
            </Link>

            {/* Gestion des environnements (dialog) */}
            <button type="button" onClick={() => setEnvOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]">
              <Layers size={15} /> Project Environment
            </button>

            {/* Create Service — dropdown typé */}
            <div className="relative">
              <button type="button" onClick={() => setCreateMenuOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90">
                <Plus size={15} /> Create Service <ChevronDown size={14} />
              </button>
              {createMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCreateMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Actions</p>
                    {CREATE_ITEMS.map((item) => (
                      <button key={item.kind} type="button" onClick={() => openCreate(item.kind)}
                        disabled={item.disabled}
                        title={item.disabled ? 'Multi-service Docker Compose is coming soon' : undefined}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] transition enabled:hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50">
                        {item.icon}
                        {item.label}
                        {item.disabled && (
                          <span className="ml-auto rounded-full border border-[var(--border)] bg-[var(--hover)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--text-muted)]">Soon</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Settings (membres + suppression) */}
            <button type="button" onClick={() => setSettingsOpen(true)}
              title="Project settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">
              <Settings size={16} />
            </button>
          </div>
        }
      />

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
          {environments.length} environment{environments.length !== 1 ? 's' : ''}
        </span>
        {currentMember && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
            {currentMember.role}
          </span>
        )}
      </div>

      {deleteError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{deleteError}</span>
          <button type="button" onClick={() => setDeleteError(null)}
            className="shrink-0 rounded-lg border border-red-500/30 px-2 py-0.5 text-xs hover:bg-red-500/20">
            Dismiss
          </button>
        </div>
      )}

      {/* Corps = liste des services (style Dokploy) */}
      <ServicesList
        projectId={id}
        services={servicesQuery.data ?? []}
        onAddService={() => openCreate(undefined)}
      />

      {/* Create Service wizard (type pré-sélectionné depuis le dropdown) */}
      <AddServiceWizard
        projectId={id}
        open={addServiceOpen}
        initialKind={addServiceKind}
        onClose={() => setAddServiceOpen(false)}
        onCreated={() => { setAddServiceOpen(false); void servicesQuery.refetch(); }}
      />

      {/* Project Environment (gestion des environnements) */}
      <Modal open={envOpen} onClose={() => setEnvOpen(false)} title="Project environments" size="lg">
        <ProjectEnvironmentsTab projectId={id} onChanged={() => void refresh()} />
      </Modal>

      {/* Settings (membres & accès + suppression) */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Project settings" size="lg">
        <ProjectMembersTab
          project={project}
          isOwner={isOwner}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          addMemberOpen={members.addMemberOpen}
          setAddMemberOpen={members.setAddMemberOpen}
          teams={members.teams}
          selectedTeamId={members.selectedTeamId}
          setSelectedTeamId={members.setSelectedTeamId}
          addTeamLoading={members.addTeamLoading}
          addTeamSuccess={members.addTeamSuccess}
          addTeamError={members.addTeamError}
          onAddMember={members.handleAddMember}
          onRemoveMember={members.handleRemoveMember}
          onAddTeam={members.handleAddTeam}
          onDeleteProject={isOwner ? handleDelete : undefined}
          deleteLoading={deleteLoading}
        />
      </Modal>
    </div>
  );
}
