"use client";

import {
  Activity,
  Eye,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownItem,
  DropdownDivider,
} from "@/shared/ui/dropdown-menu";
import type { Server } from "@/features/servers/types/server";

type ServerRowActionsMenuProps = {
  server: Server;
  disabled?: boolean;
  onOpenTerminal: (server: Server) => void;
  onOpenSetup: (server: Server) => void;
  onOpenMonitoring: (server: Server) => void;
  onOpenDetails: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
  onValidateSsh?: (server: Server) => void;
};

/**
 * Compact "⋯" actions menu for a server table row. Uses the shared portal-based
 * DropdownMenu (Phase 1.1) so the menu escapes the table's `overflow-x-auto`
 * wrapper — the previous `absolute` menu was clipped and caused a stray
 * scrollbar.
 */
export function ServerRowActionsMenu({
  server,
  disabled,
  onOpenTerminal,
  onOpenSetup,
  onOpenMonitoring,
  onOpenDetails,
  onEdit,
  onDelete,
  onValidateSsh,
}: ServerRowActionsMenuProps) {
  return (
    <DropdownMenu
      disabled={disabled}
      label={`Actions for ${server.name}`}
      trigger={() => (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]">
          <MoreHorizontal size={15} />
        </span>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem
            icon={<Terminal size={14} />}
            onClick={() => {
              close();
              onOpenTerminal(server);
            }}
          >
            Enter Terminal
          </DropdownItem>
          <DropdownItem
            icon={<ShieldCheck size={14} />}
            onClick={() => {
              close();
              onValidateSsh?.(server);
            }}
          >
            Validate SSH
          </DropdownItem>
          <DropdownItem
            icon={<Wrench size={14} />}
            onClick={() => {
              close();
              onOpenSetup(server);
            }}
          >
            Setup Server
          </DropdownItem>
          <DropdownItem
            icon={<Activity size={14} />}
            onClick={() => {
              close();
              onOpenMonitoring(server);
            }}
          >
            Monitoring
          </DropdownItem>
          <DropdownItem
            icon={<Pencil size={14} />}
            onClick={() => {
              close();
              onEdit(server);
            }}
          >
            Edit
          </DropdownItem>
          <DropdownItem
            icon={<Eye size={14} />}
            onClick={() => {
              close();
              onOpenDetails(server);
            }}
          >
            View Details
          </DropdownItem>
          <DropdownDivider />
          <DropdownItem
            icon={<Trash2 size={14} />}
            danger
            onClick={() => {
              close();
              onDelete(server);
            }}
          >
            Delete
          </DropdownItem>
        </>
      )}
    </DropdownMenu>
  );
}
