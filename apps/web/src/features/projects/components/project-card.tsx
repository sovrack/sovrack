"use client";

import Link from "next/link";
import {
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import clsx from "clsx";
import type { ProjectListItem } from "@/features/projects/types/project";

type ProjectCardProps = {
  project: ProjectListItem;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const hasGitlabConfig = project.hasGitlabConfig ?? false;
  const hasEnv = (project.environmentCount ?? 0) > 0;
  const isReadyToDeploy = hasGitlabConfig && hasEnv;
  const memberCount = project.memberCount;
  const initial = project.name.charAt(0).toUpperCase();

  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card p-5 transition hover:border-accent/20 hover:">
        {/* Header */}
        <Link
          href={`/projects/${project.id}`}
          className="flex items-start gap-3"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-hover/10 text-sm font-bold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-primary">
              {project.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-secondary">
              {project.description ?? "No description"}
            </p>
          </div>
          {/* Source badge */}
          <span
            className={clsx(
              "shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold",
              hasGitlabConfig
                ? "bg-green-500/10 text-green-300 border border-green-500/20"
                : "bg-hover/10 text-muted border border-border",
            )}
          >
            {hasGitlabConfig ? (
              <CheckCircle size={10} />
            ) : (
              <XCircle size={10} />
            )}
            {hasGitlabConfig ? "Source OK" : "No git source"}
          </span>
        </Link>

        {/* Env status */}
        <Link
          href={`/projects/${project.id}`}
          className="mt-3 flex items-center gap-3"
        >
          <span className="text-xs text-muted">
            {project.environmentCount} env
            {project.environmentCount !== 1 ? "s" : ""}
          </span>
          <span
            className={clsx(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border",
              isReadyToDeploy
                ? "bg-green-500/10 text-green-300 border-green-500/20"
                : "bg-amber-500/10 text-amber-300 border-amber-500/20",
            )}
          >
            {isReadyToDeploy ? (
              <>
                <CheckCircle2 size={10} /> Ready to deploy
              </>
            ) : (
              <>
                <AlertCircle size={10} />{" "}
                {!hasGitlabConfig ? "No git source" : "No environment"}
              </>
            )}
          </span>
        </Link>

        {/* Footer */}
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <Link
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition"
          >
            <Users size={11} />
            {memberCount} membre{memberCount !== 1 ? "s" : ""}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/projects/${project.id}?tab=services`}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary transition hover:text-primary hover:bg-hover/10"
            >
              Configure
            </Link>
          </div>
        </div>
      </div>
  );
}
