"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Layers,
  Loader2,
  Plus,
  Rocket,
  Settings,
} from "lucide-react";
import { useAuth } from "@/features/auth/api/use-auth";
import { useProject } from "@/features/projects/api/use-projects";
import { useProjectServices } from "@/features/projects/api/use-project-services";
import { useProjectEnvironments } from "@/features/projects/api/use-project-environments";
import { useProjectMembers } from "@/features/projects/api/use-project-members";
import { useConfirm } from "@/shared/contexts/confirm-context";
import { PageHeader } from "@/shared/layout/page-header";
import { Modal } from "@/shared/ui/modal";
import { ProjectEnvironmentsTab } from "@/features/projects/components/project-environments-tab";
import { ServicesList } from "@/features/projects/components/tabs/service/services-list";
import { AddServiceWizard } from "@/features/projects/components/add-service-wizard";
import { ProjectMembersTab } from "@/features/projects/components/project-members-tab";
import { DeployDialog } from "@/features/projects/components/deploy-dialog";
import { getApiErrorMessage } from "@/shared/lib/api";
import { projectsService } from "@/features/projects/api/projects.service";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { project, loading, error, refresh } = useProject(id);

  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const members = useProjectMembers({
    projectId: id,
    isAdmin,
  });
  const servicesQuery = useProjectServices(id);
  const environmentsQuery = useProjectEnvironments(id);
  const environments = environmentsQuery.data ?? [];
  const confirm = useConfirm();

  const openCreate = () => {
    setAddServiceOpen(true);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${project?.name}"?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete project",
      variant: "danger",
    });
    if (!ok) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await projectsService.remove(id);
      router.push("/projects");
    } catch (err) {
      setDeleteError(getApiErrorMessage(err));
      setDeleteLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2
          size={24}
          className="animate-spin text-[var(--text-secondary)]"
        />
      </div>
    );

  if (error || !project)
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
        {error ?? "Project not found."}
        <div className="mt-3">
          <Link href="/projects" className="text-xs text-red-300 underline">
            Back to Projects
          </Link>
        </div>
      </div>
    );

  const currentMember = project.members.find((m) => m.user.id === user?.id);
  const isOwner = isAdmin || currentMember?.role === "OWNER";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description={project.description ?? "No description"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={15} /> Projects
            </Link>

            {/* Déployer — ouvre le même dialog que le bouton Deploy du service */}
            <button
              type="button"
              onClick={() => setDeployOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Rocket size={15} /> Deploy
            </button>

            {/* Gestion des environnements (dialog) */}
            <button
              type="button"
              onClick={() => setEnvOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
            >
              <Layers size={15} /> Project Environment
            </button>

            {/* Create Service — ouvre le wizard « Choose a service type » */}
            <button
              type="button"
              onClick={() => openCreate()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              <Plus size={15} /> Create Service
            </button>

            {/* Settings (membres + suppression) */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Project settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              <Settings size={16} />
            </button>
          </div>
        }
      />

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--hover)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
          {environments.length} environment
          {environments.length !== 1 ? "s" : ""}
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
          <button
            type="button"
            onClick={() => setDeleteError(null)}
            className="shrink-0 rounded-lg border border-red-500/30 px-2 py-0.5 text-xs hover:bg-red-500/20"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Corps = liste des services (style Dokploy) */}
      <ServicesList
        projectId={id}
        services={servicesQuery.data ?? []}
        onAddService={() => openCreate()}
      />

      {/* Create Service wizard — démarre sur « Choose a service type » */}
      <AddServiceWizard
        projectId={id}
        open={addServiceOpen}
        onClose={() => setAddServiceOpen(false)}
        onCreated={() => {
          setAddServiceOpen(false);
          void servicesQuery.refetch();
        }}
      />

      {/* Deploy — même dialog que le bouton Deploy d'un service */}
      <DeployDialog
        projectId={id}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCreated={() => {
          setDeployOpen(false);
          void servicesQuery.refetch();
        }}
        services={servicesQuery.data ?? []}
      />

      {/* Project Environment (gestion des environnements) */}
      <Modal
        open={envOpen}
        onClose={() => setEnvOpen(false)}
        title="Project environments"
        size="lg"
      >
        <ProjectEnvironmentsTab
          projectId={id}
          onChanged={() => void refresh()}
        />
      </Modal>

      {/* Settings (membres & accès + suppression) */}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Project settings"
        size="lg"
      >
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
          /* Suppression de projet réservée ADMIN côté backend
             (projects.controller.ts: @Roles(Role.ADMIN)) — un OWNER de
             projet non-ADMIN ne doit pas voir ce bouton (il recevrait
             systématiquement une 403 au clic). */
          onDeleteProject={isAdmin ? handleDelete : undefined}
          deleteLoading={deleteLoading}
        />
      </Modal>
    </div>
  );
}
