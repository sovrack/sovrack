"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";
import type { TopProject } from "@/features/dashboard/types/dashboard";
import { timeAgo } from "@/shared/lib/format-date";

type Props = { projects: TopProject[] };

export function TopProjectsCard({ projects }: Props) {
  if (projects.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <TrendingUp size={14} />
        Top projets — 30 jours
      </p>

      <ul className="space-y-2">
        {projects.map((project, idx) => (
          <li key={project.id} className="flex items-center gap-3">
            <span className="w-4 text-xs font-bold text-[var(--text-secondary)]">
              {idx + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <Link
                  href={`/projects/${project.id}`}
                  className="truncate text-sm font-semibold text-[var(--text-primary)] hover:underline"
                >
                  {project.name}
                </Link>
                <span className="ml-2 shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                  {project.deployCount} deploy
                  {project.deployCount > 1 ? "s" : ""}
                </span>
              </div>

              {/* Success rate bar */}
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      project.successRate >= 80
                        ? "bg-emerald-400"
                        : project.successRate >= 50
                          ? "bg-amber-400"
                          : "bg-red-400"
                    }`}
                    style={{ width: `${project.successRate}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                  {project.successRate}%
                </span>
                <span className="shrink-0 text-xs text-[var(--text-secondary)]">
                  {timeAgo(project.lastDeployedAt)}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
