"use client";

import Link from "next/link";
import {
  ChevronRight,
  Container as ContainerIcon,
  Database,
  FolderGit2,
  Plus,
} from "lucide-react";
import type { Service } from "@/features/projects/types/service";

function serviceIcon(svc: Service) {
  if (svc.type === "DATABASE") return Database;
  if (svc.sourceType === "DOCKER_IMAGE") return ContainerIcon;
  return FolderGit2;
}

function serviceSummary(svc: Service): string {
  if (svc.type === "DATABASE") {
    return `${svc.databaseType ?? "Database"} · ${svc.databaseVersion ?? "latest"}`;
  }
  const parts = [
    svc.repoPath ?? svc.repoUrl ?? svc.sourceType ?? "Application",
  ];
  if (svc.buildPack) parts.push(svc.buildPack);
  if (svc.branch) parts.push(svc.branch);
  return parts.join(" · ");
}

/**
 * Real services list for the project "Services" tab — replaces the old
 * project-level Source/Build config view. Each card links to the service detail
 * where Source/Build are now editable per service (PLAN_AMELIORATION.md §5.1).
 */
export function ServicesList({
  projectId,
  services,
  onAddService,
}: {
  projectId: string;
  services: Service[];
  onAddService?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-primary">
            Services
          </h2>
          <p className="text-xs text-muted">
            {services.length} service{services.length !== 1 ? "s" : ""} in this
            project
          </p>
        </div>
      </div>

      {services.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium text-primary">
            No services yet
          </p>
          <p className="mt-1 text-xs text-muted">
            Connect a Git source to add your first service.
          </p>
          {onAddService && (
            <button
              type="button"
              onClick={onAddService}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary transition hover:bg-hover/10"
            >
              <Plus size={15} /> Add service
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {services.map((svc) => {
            const Icon = serviceIcon(svc);
            return (
              <Link
                key={svc.id}
                href={`/projects/${projectId}/services/${svc.id}`}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:border-muted hover:bg-hover/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hover/10">
                  <Icon size={16} className="text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-primary">
                    {svc.name}
                  </p>
                  <p className="truncate font-mono text-xs text-muted">
                    {serviceSummary(svc)}
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                  {svc.type}
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted transition group-hover:text-primary"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
