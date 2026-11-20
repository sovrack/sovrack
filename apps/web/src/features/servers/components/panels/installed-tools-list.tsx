import { Badge } from "@/shared/ui/badge";
import type { ServerInstalledTool } from "@/features/servers/types/server";

type Props = {
  tools: ServerInstalledTool[];
};

export function InstalledToolsList({ tools }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary">
        Installed tools
      </p>
      <h3 className="mt-1 text-lg font-semibold text-primary">
        Tool inventory
      </h3>
      {tools.length === 0 ? (
        <p className="mt-4 text-sm text-secondary">
          No tools detected yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-hover/10 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-primary">
                  {tool.displayName}
                </p>
                <p className="text-xs text-secondary">
                  {tool.version || "Version unknown"}
                </p>
              </div>
              <Badge tone={tool.status === "INSTALLED" ? "success" : "default"}>
                {tool.status}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
