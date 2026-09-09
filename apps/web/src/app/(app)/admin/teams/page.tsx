"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Users2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { TeamCreateDialog } from "@/features/teams";
import { useTeams } from "@/features/teams/api/use-teams";

export default function AdminTeamsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { teams, loading, error, refresh } = useTeams();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("dialog") === "create-team") {
      setDialogOpen(true);
    }
  }, [searchParams]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    const next = new URLSearchParams(searchParams.toString());
    if (next.has("dialog")) {
      next.delete("dialog");
      const queryString = next.toString();
      router.replace(
        queryString ? `/admin/teams?${queryString}` : "/admin/teams",
      );
    }
  }, [router, searchParams]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Espaces de travail"
        description="Séparez votre espace personnel des organisations dans lesquelles vous collaborez."
        actions={
          <Button onClick={() => setDialogOpen(true)} icon={<Plus size={14} />}>
            Créer une organisation
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Chargement…</p>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="Aucun espace"
          description="Créez une organisation pour collaborer et gérer les accès aux projets."
          action={
            <Button
              onClick={() => setDialogOpen(true)}
              icon={<Plus size={14} />}
            >
              Créer une organisation
            </Button>
          }
        />
      ) : (
        <SectionCard
          title={`${teams.length} espace${teams.length > 1 ? "s" : ""}`}
          contentClassName="space-y-2"
        >
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/admin/teams/${team.id}`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--hover)] px-4 py-3 transition hover:border-[var(--text-muted)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {team.name}
                  </p>
                  {team.description && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)] line-clamp-2">
                      {team.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {team.type === "PERSONAL" ? "Personnel" : "Organisation"}
                  </span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {team.role}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </SectionCard>
      )}

      <TeamCreateDialog
        open={dialogOpen}
        onClose={closeDialog}
        onCreated={async () => {
          closeDialog();
          await refresh();
        }}
      />
    </div>
  );
}
