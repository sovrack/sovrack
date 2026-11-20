"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, CheckCircle2, Rocket } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deploymentsService } from "@/features/deployments/api/deployments.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { DeploymentLogsDialog } from "@/features/projects/components/tabs/runs/deployment-logs-dialog";
import { DeploymentContainerDialog } from "@/features/deployments/components/deployment-container-dialog";
import { ProjectDeploymentsTab } from "@/features/projects/components/project-deployments-tab";
import { PageHeader } from "@/shared/layout/page-header";
import { SubNav } from "@/shared/layout/sub-nav";
import { Pagination } from "@/shared/ui/pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import type { Deployment } from "@/features/deployments/types";

const DELIVERY_TABS = [
  { label: "Déploiements", href: "/deployments" },
  { label: "Pipelines", href: "/pipelines" },
];

/**
 * Centre de déploiements (tous projets) — CONSOLE de consultation filtrable.
 * On NE déploie PAS depuis ici (un déploiement se définit dans un contexte
 * service × env, depuis le projet/service / la matrice) : ici on filtre, on
 * consulte le statut, on ouvre logs/conteneur, on rollback/redeploy par ligne.
 */

/** Déclencheur dérivé (champs exposés : externalPipelineId + user). */
function deriveTrigger(d: Deployment): "manual" | "pipeline" | "auto" {
  if (d.externalPipelineId) return "pipeline";
  if (d.user) return "manual";
  return "auto";
}

const TRIGGER_LABEL: Record<"manual" | "pipeline" | "auto", string> = {
  manual: "Manuel",
  pipeline: "Pipeline CI",
  auto: "Automatique (webhook/récupération)",
};

const STATUS_OPTIONS = [
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "CANCELED",
] as const;

const SELECT_CLASS =
  "h-10 rounded-lg border border-border bg-card px-3 text-sm text-primary outline-none";

export default function DeploymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["deployments-page"],
    queryFn: () => deploymentsService.getAll(),
    refetchInterval: 10_000,
  });

  const allDeployments: Deployment[] = useMemo(() => data ?? [], [data]);
  const error = queryError ? getApiErrorMessage(queryError) : null;

  // Filtres (le projet peut être pré-sélectionné via ?project=<id>).
  const [projectFilter, setProjectFilter] = useState<string>(
    searchParams.get("project") ?? "all",
  );
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [triggerFilter, setTriggerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of allDeployments) {
      if (d.project?.id) map.set(d.project.id, d.project.name ?? d.project.id);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allDeployments]);

  const envOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allDeployments
            .map((d) => d.environment?.name)
            .filter((n): n is string => Boolean(n)),
        ),
      ).sort(),
    [allDeployments],
  );

  const filtered = useMemo(
    () =>
      allDeployments.filter((d) => {
        if (projectFilter !== "all" && d.project?.id !== projectFilter)
          return false;
        if (envFilter !== "all" && d.environment?.name !== envFilter)
          return false;
        if (statusFilter !== "all" && d.status !== statusFilter) return false;
        if (triggerFilter !== "all" && deriveTrigger(d) !== triggerFilter)
          return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const hay =
            `${d.branch ?? ""} ${d.service?.name ?? ""} ${d.project?.name ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [
      allDeployments,
      projectFilter,
      envFilter,
      statusFilter,
      triggerFilter,
      search,
    ],
  );

  const { page, totalPages, paged, goToPage } = usePagination(filtered, {
    pageSize: 15,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["deployments-page"] });
    await refetch();
  };

  // Deep-links (?logs= / ?container=) — ouvrent un dialog ici.
  const logsId = searchParams.get("logs");
  const containerId = searchParams.get("container");
  const closeDeepLink = (key: "logs" | "container") => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(key);
    const q = next.toString();
    router.replace(q ? `/deployments?${q}` : "/deployments");
  };

  const running = filtered.filter((d) => d.status === "RUNNING").length;
  const success = filtered.filter((d) => d.status === "SUCCESS").length;
  const failed = filtered.filter((d) => d.status === "FAILED").length;

  const resetFilters = () => {
    setProjectFilter("all");
    setEnvFilter("all");
    setStatusFilter("all");
    setTriggerFilter("all");
    setSearch("");
  };
  const hasActiveFilter =
    projectFilter !== "all" ||
    envFilter !== "all" ||
    statusFilter !== "all" ||
    triggerFilter !== "all" ||
    search.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Livraison"
        title="Déploiements"
        description="Consultez et filtrez les déploiements de tous vos projets."
      />

      <SubNav tabs={DELIVERY_TABS} />

      {/* KPIs (sur l'ensemble filtré) */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Total",
            value: filtered.length,
            icon: <Rocket size={14} />,
            color: "",
          },
          {
            label: "Réussis",
            value: success,
            icon: <CheckCircle2 size={14} />,
            color: "text-green-400",
          },
          {
            label: "En cours / Échoués",
            value: running + failed,
            icon: <Activity size={14} />,
            color:
              running > 0 ? "text-accent" : failed > 0 ? "text-red-400" : "",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card px-4 py-4"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              {stat.icon} {stat.label}
            </div>
            <p
              className={`mt-2 text-3xl font-bold ${stat.color || "text-primary"}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Barre de filtres */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-5">
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Projet"
        >
          <option value="all">Tous les projets</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={envFilter}
          onChange={(e) => setEnvFilter(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Environnement"
        >
          <option value="all">Tous les environnements</option>
          {envOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={SELECT_CLASS}
          aria-label="État"
        >
          <option value="all">Tous les états</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          className={SELECT_CLASS}
          aria-label="Déclencheur"
        >
          <option value="all">Tous les déclencheurs</option>
          {(["manual", "pipeline", "auto"] as const).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Branche, service, projet…"
          className={SELECT_CLASS}
          aria-label="Rechercher"
        />
      </div>

      {hasActiveFilter && (
        <div className="flex items-center justify-between gap-3 text-xs text-secondary">
          <span>
            {filtered.length} déploiement(s) correspondent aux filtres.
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-border px-2.5 py-1 font-semibold text-primary transition hover:bg-hover/10"
          >
            Réinitialiser
          </button>
        </div>
      )}

      {/* Liste (page courante) — le filtrage/statut est géré ci-dessus. */}
      <ProjectDeploymentsTab
        deployments={paged}
        loading={loading}
        error={error}
        headerCount={filtered.length}
        showStatusFilter={false}
        onRefresh={() => void refresh()}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={goToPage} />

      {/* Deep-linked dialogs (?logs=<id> / ?container=<id>) */}
      <DeploymentLogsDialog
        open={!!logsId}
        deploymentId={logsId}
        onClose={() => closeDeepLink("logs")}
      />
      <DeploymentContainerDialog
        open={!!containerId}
        deploymentId={containerId}
        onClose={() => closeDeepLink("container")}
      />
    </div>
  );
}
