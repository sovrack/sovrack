"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  GitBranch,
  Plus,
  Rocket,
  Server,
  Zap,
} from "lucide-react";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { dashboardService } from "@/features/dashboard/api/dashboard.service";
import { deploymentsService } from "@/features/deployments/api/deployments.service";
import { resolveDeploymentUrl } from "@/features/deployments/utils";
import { DeploymentStatusBadge } from "@/features/deployments/components/deployment-status-badge";
import { ActivityChart } from "@/features/dashboard/components/activity-chart";
import { ServerHealthCard } from "@/features/dashboard/components/server-health-card";
import { TopProjectsCard } from "@/features/dashboard/components/top-projects-card";
import { PageHeader } from "@/shared/layout/page-header";
import { Alert } from "@/shared/ui/alert";
import { timeAgo } from "@/shared/lib/format-date";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

type KpiCardProps = {
  title: string;
  value: string | number;
  subtitle: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "error" | "warning";
};

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "default",
}: KpiCardProps) {
  const valueColor =
    tone === "success"
      ? "text-emerald-400"
      : tone === "error"
        ? "text-red-400"
        : tone === "warning"
          ? "text-amber-400"
          : "text-[var(--text-primary)]";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {icon}
        {title}
      </p>
      <p className={`mt-3 text-4xl font-semibold leading-none ${valueColor}`}>
        {value}
      </p>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{subtitle}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-stats-v2"],
    queryFn: () => dashboardService.getStats(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: recentDeployments } = useQuery({
    queryKey: ["dashboard-recent-deployments"],
    queryFn: () => deploymentsService.getAll(),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const queryError = error ? getApiErrorMessage(error) : null;

  const kpis = data?.kpis;
  const successRateTone =
    kpis && kpis.successRate7d >= 80
      ? "success"
      : kpis && kpis.successRate7d >= 50
        ? "warning"
        : kpis && kpis.deploymentsLast7d > 0
          ? "error"
          : "default";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accueil"
        title={`Bienvenue, ${user?.fullName ?? "Administrateur"}`}
        description="Vue d'ensemble de vos projets et de l'activité de déploiement."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90"
            >
              Projets <ArrowRight size={14} />
            </Link>
          </div>
        }
      />

      {queryError && (
        <Alert tone="error" title="Impossible de charger les données du tableau de bord">
          {queryError}
        </Alert>
      )}

      {/* Bannières d'alerte */}
      {kpis && kpis.runningCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <Zap size={15} className="shrink-0 text-blue-400 animate-pulse" />
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-blue-400">
              {kpis.runningCount} déploiement{kpis.runningCount > 1 ? "s" : ""}{" "}
              en cours
            </span>{" "}
            —{" "}
            <Link
              href="/deployments"
              className="underline hover:text-[var(--text-primary)]"
            >
              Surveiller
            </Link>
          </p>
        </div>
      )}
      {data && data.recentFailures.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-400" />
          <div className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-red-400">
              {data.recentFailures.length} échec{data.recentFailures.length > 1 ? "s" : ""}{" "}
              récent{data.recentFailures.length > 1 ? "s" : ""}
            </span>{" "}
            — {data.recentFailures[0].projectName} ·{" "}
            {data.recentFailures[0].environmentName} ·{" "}
            {timeAgo(data.recentFailures[0].createdAt)}{" "}
            <Link
              href={`/deployments?logs=${data.recentFailures[0].id}`}
              className="underline hover:text-[var(--text-primary)]"
            >
              voir
            </Link>
          </div>
        </div>
      )}

      {/* Actions rapides (admin) */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              label: "Nouveau projet",
              icon: <Plus size={15} />,
              href: "/projects?dialog=create-project",
              primary: true,
            },
            {
              label: "Déploiements",
              icon: <Rocket size={15} />,
              href: "/deployments",
              primary: false,
            },
            {
              label: "Projets",
              icon: <GitBranch size={15} />,
              href: "/projects",
              primary: false,
            },
            {
              label: "Serveurs",
              icon: <Server size={15} />,
              href: "/admin/servers",
              primary: false,
            },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:opacity-90 ${
                action.primary
                  ? "bg-[var(--text-primary)] text-[var(--bg-app)]"
                  : "border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]"
              }`}
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      )}

      {/* Ligne KPI */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl bg-[var(--hover)]"
            />
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            title="Projets"
            value={kpis.totalProjects}
            subtitle={`${kpis.totalEnvironments} environnements`}
          />
          <KpiCard
            title="Déploiements / 7j"
            value={kpis.deploymentsLast7d}
            subtitle={`${kpis.deploymentsLast30d} ce mois`}
          />
          <KpiCard
            title="Taux de réussite"
            value={kpis.deploymentsLast7d > 0 ? `${kpis.successRate7d}%` : "—"}
            subtitle="sur 7 jours"
            icon={<CheckCircle2 size={11} />}
            tone={successRateTone}
          />
          <KpiCard
            title="Durée moyenne"
            value={formatDuration(kpis.avgDurationSeconds)}
            subtitle="par déploiement (30j)"
            icon={<Clock size={11} />}
          />
        </div>
      ) : null}

      {/* Résumé statut + Graphique activité */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Carte statut */}
        {kpis && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Statut actuel
            </p>
            <ul className="space-y-2.5">
              {[
                {
                  label: "En cours",
                  value: kpis.runningCount,
                  color: "bg-blue-400",
                },
                {
                  label: "Échecs (7j)",
                  value: kpis.failedCount,
                  color: "bg-red-400",
                },
                {
                  label: "Projets inactifs",
                  value: kpis.idleProjectsCount,
                  color: "bg-zinc-500",
                },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Graphique activité */}
        <div className="lg:col-span-2">
          {data?.activity ? (
            <ActivityChart data={data.activity} />
          ) : (
            <div className="h-full min-h-[140px] animate-pulse rounded-xl bg-[var(--hover)]" />
          )}
        </div>
      </div>

      {/* Top projets + Santé serveurs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data?.topProjects && data.topProjects.length > 0 && (
          <TopProjectsCard projects={data.topProjects} />
        )}
        {data?.servers && isAdmin && data.servers.total > 0 && (
          <ServerHealthCard servers={data.servers} isAdmin={isAdmin} />
        )}
      </div>

      {/* Déploiements récents (tous statuts) */}
      {recentDeployments && recentDeployments.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Rocket size={14} /> Déploiements récents
            </p>
            <Link
              href="/deployments"
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              tout voir →
            </Link>
          </div>
          <ul className="space-y-2">
            {recentDeployments.slice(0, 6).map((d) => {
              const url = resolveDeploymentUrl(d);
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <DeploymentStatusBadge status={d.status} />
                    <span className="truncate font-semibold text-[var(--text-primary)]">
                      {d.service?.name ?? d.project?.name ?? "service"}
                    </span>
                    <span className="hidden text-[var(--text-secondary)] sm:inline">
                      · {d.environment?.name}
                    </span>
                    <code className="hidden text-xs text-[var(--text-muted)] md:inline">
                      {d.branch}
                    </code>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {url && d.status === "SUCCESS" && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        ouvrir ↗
                      </a>
                    )}
                    <Link
                      href={`/deployments?logs=${d.id}`}
                      className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      voir →
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Détail échecs récents */}
      {data && data.recentFailures.length > 1 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <AlertTriangle size={14} className="text-red-400" />
            Échecs de déploiement — 7 derniers jours
          </p>
          <ul className="space-y-2">
            {data.recentFailures.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {f.projectName}
                  </span>
                  <span className="mx-1 text-[var(--text-secondary)]">·</span>
                  <span className="text-[var(--text-secondary)]">
                    {f.environmentName}
                  </span>
                  <span className="mx-1 text-[var(--text-secondary)]">·</span>
                  <code className="text-xs text-[var(--text-secondary)]">
                    {f.branch}
                  </code>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text-secondary)]">
                    {timeAgo(f.createdAt)}
                  </span>
                  <Link
                    href={`/deployments?logs=${f.id}`}
                    className="text-xs font-semibold text-red-400 hover:underline"
                  >
                    voir →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}