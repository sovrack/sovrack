"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, Settings } from "lucide-react";
import clsx from "clsx";
import { ENV_BADGE } from "@/features/deployments/utils";
import type { Environment } from "@/features/projects/types/environment";
import type { Service } from "@/features/projects/types/service";

type EnvLink = NonNullable<Service["envLinks"]>[number];

/**
 * Resolves the server actually serving this ServiceEnvironment: its own
 * serverId override, falling back to the environment's first attached server
 * (same fallback rule the deploy engine applies — see
 * VERIFICATION_SERVICE_ENVIRONMENT.md §2).
 */
function resolveServer(link: EnvLink, env: Environment | undefined) {
  if (!env) return null;
  const targetId = link.serverId ?? env.servers?.[0]?.id;
  return env.servers?.find((s) => s.id === targetId) ?? null;
}

export function ServiceEnvironmentSelector({
  projectId,
  envLinks,
  environments,
  selectedEnvId,
  onSelect,
}: {
  projectId: string;
  envLinks: Service["envLinks"];
  environments: Environment[];
  selectedEnvId: string;
  onSelect: (environmentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const links = envLinks ?? [];
  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  if (links.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {/* Task 3 ("Correction rapide"): the trigger used to wrap the
          environment name in a per-environment colored pill (ENV_BADGE),
          which made it stand out as its own distinct colored element from
          the rest of the (plain border+bg-card) header. It's now plain text,
          matching Project/Delete exactly — only the dropdown list below
          (opened on click) still color-codes each option for fast scanning. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-secondary transition hover:text-primary hover:bg-hover/10"
      >
        <Layers size={14} className="text-muted" />
        {selectedEnv ? (
          <span>
            Environment: <span className="font-medium">{selectedEnv.name}</span>
          </span>
        ) : (
          <span className="text-muted">Select environment</span>
        )}
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-2 shadow-theme-lg">
          <div className="space-y-0.5">
            {links.map((link) => {
              const env = environments.find((e) => e.id === link.environmentId);
              const server = resolveServer(link, env);
              const reachable = server ? server.status !== "UNREACHABLE" : null;
              const selected = link.environmentId === selectedEnvId;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => {
                    onSelect(link.environmentId);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition",
                    selected
                      ? "bg-hover/10 text-primary"
                      : "text-secondary hover:bg-hover/10 hover:text-primary",
                  )}
                >
                  {reachable !== null && (
                    <span
                      className={clsx(
                        "h-2 w-2 shrink-0 rounded-full",
                        reachable ? "bg-green-500" : "bg-red-500",
                      )}
                      title={
                        reachable
                          ? "Server reachable"
                          : "Server unreachable"
                      }
                    />
                  )}
                  <span
                    className={clsx(
                      "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase",
                      ENV_BADGE[env?.name ?? ""] ??
                        "border-border bg-hover/10 text-secondary",
                    )}
                  >
                    {env?.name ?? "?"}
                  </span>
                  {server && (
                    <span className="truncate text-xs text-muted">
                      {server.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t border-border pt-1.5">
            <Link
              href={`/projects/${projectId}?openEnvironments=true`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted transition hover:bg-hover/10 hover:text-primary"
            >
              <Settings size={12} />
              Manage project environments →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
