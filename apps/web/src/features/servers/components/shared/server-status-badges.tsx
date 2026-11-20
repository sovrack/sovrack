import { CheckCircle, CircleDashed } from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/shared/ui/badge";
import type { Server } from "@/features/servers/types/server";

type BadgeProps = { label: string; active: boolean };

function ToolBadge({ label, active }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold",
        active
          ? "border border-green-500/20 bg-green-500/10 text-green-400"
          : "border border-border bg-hover/10 text-muted",
      )}
    >
      {active ? <CheckCircle size={11} /> : <CircleDashed size={11} />}
      {label}
    </span>
  );
}

type ServerOverallStatus = {
  label: string;
  description: string;
  tone: "default" | "success" | "warning" | "error" | "info";
};

export function getServerOverallStatus(
  server: Pick<
    Server,
    "isActive" | "status" | "isVerified" | "hasDocker" | "hasRunner"
  >,
): ServerOverallStatus {
  if (!server.isActive || server.status === "DISABLED") {
    return {
      label: "Disabled",
      description: "Server disabled by admin",
      tone: "default",
    };
  }

  if (server.status === "UNREACHABLE") {
    return {
      label: "Server unreachable",
      description: "Server is unreachable — check network and SSH credentials",
      tone: "error",
    };
  }

  if (server.status === "PREPARED") {
    return {
      label: "Server ready",
      description: "Set up from the control node with Ansible",
      tone: "success",
    };
  }

  if (server.status === "PARTIALLY_PREPARED") {
    return {
      label: "Setup partial",
      description: "Some setup roles require attention",
      tone: "warning",
    };
  }

  if (server.status === "PREPARATION_FAILED") {
    return {
      label: "Setup failed",
      description: "Ansible setup failed — view logs and retry setup",
      tone: "error",
    };
  }

  if (
    server.status === "PREPARING" ||
    server.status === "PREPARATION_PENDING"
  ) {
    return {
      label: "Setup running",
      description: "Setup job is running or queued",
      tone: "info",
    };
  }

  if (server.status === "INFO_DETECTED") {
    return {
      label: "Setup required",
      description: "Detection completed — select options and run setup",
      tone: "info",
    };
  }

  if (server.status === "SSH_VALIDATED") {
    return {
      label: "Detecting…",
      description: "SSH validated — detecting server info automatically",
      tone: "info",
    };
  }

  if (server.status === "VALIDATION_FAILED") {
    return {
      label: "SSH validation required",
      description: "SSH validation failed — re-run Validate SSH",
      tone: "error",
    };
  }

  if (server.isVerified) {
    return {
      label: "Detecting…",
      description: "SSH validated — detecting server info automatically",
      tone: "info",
    };
  }

  return {
    label: "SSH validation required",
    description: "SSH connection has not been validated yet",
    tone: "warning",
  };
}

export function ServerOverallStatusBadge({ server }: { server: Server }) {
  const status = getServerOverallStatus(server);

  return (
    <div className="space-y-1">
      <Badge tone={status.tone} dot>
        {status.label}
      </Badge>
      <p className="text-[11px] text-secondary">
        {status.description}
      </p>
    </div>
  );
}

// A4: real per-server tool badges, driven by Server.installedTools (capability
// detection) — not a generic/hardcoded pair like ServerWorkflowBadges'
// Docker/Runner booleans below.
//
// Shows EVERY detected capability, installed (green) or missing (muted) —
// this used to filter down to INSTALLED only, which silently hid anything
// not installed instead of showing it as missing (looked identical to "not
// checked yet"). Same visual language as ServerWorkflowBadges' ToolBadge.
const TOOL_DISPLAY_PRIORITY = [
  "docker",
  "postgres",
  "redis",
  "nginx",
  "traefik",
  "gitlab_runner",
];

export function ServerToolBadges({ server }: { server: Server }) {
  const tools = server.installedTools ?? [];
  if (tools.length === 0) {
    return (
      <p className="text-[11px] text-secondary">
        No tools detected yet — detection runs automatically after SSH validation.
      </p>
    );
  }
  const sorted = [...tools].sort((a, b) => {
    const ai = TOOL_DISPLAY_PRIORITY.indexOf(a.toolKey);
    const bi = TOOL_DISPLAY_PRIORITY.indexOf(b.toolKey);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map((tool) => (
        <ToolBadge
          key={tool.toolKey}
          label={tool.displayName}
          active={tool.status === "INSTALLED"}
        />
      ))}
    </div>
  );
}

export function ServerWorkflowBadges({ server }: { server: Server }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToolBadge label="SSH" active={server.isVerified} />
      <ToolBadge label="Docker" active={server.hasDocker} />
      <ToolBadge label="Runner" active={server.hasRunner} />
      <span className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
        <CheckCircle size={11} /> Managed by control-node Ansible
      </span>
    </div>
  );
}

export function formatSetupBlockingReason(reason: string): string {
  const normalized = reason.toLowerCase();
  if (normalized.includes("validation ssh")) {
    return "SSH validation required";
  }
  if (
    normalized.includes("missing or failed") ||
    normalized.includes("absente ou echouee")
  ) {
    return "Server unreachable";
  }
  if (normalized.includes("sudo")) {
    return "Sudo access required";
  }
  if (normalized.includes("disabled") || normalized.includes("desactive")) {
    return "Server disabled";
  }
  if (
    normalized.includes("already running") ||
    normalized.includes("deja en cours")
  ) {
    return "Setup already running";
  }
  return reason;
}
