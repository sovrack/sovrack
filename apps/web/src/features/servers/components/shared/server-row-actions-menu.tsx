"use client";

import Link from "next/link";
import {
  Eye,
  MoreHorizontal,
  Pencil,
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
  onOpenSetup: (server: Server) => void;
  onOpenDetails: (server: Server) => void;
  onEdit: (server: Server) => void;
  onDelete: (server: Server) => void;
};

/**
 * Compact "⋯" actions menu for a server table row. Uses the shared portal-based
 * DropdownMenu (Phase 1.1) so the menu escapes the table's `overflow-x-auto`
 * wrapper — the previous `absolute` menu was clipped and caused a stray
 * scrollbar. Exactly the 5 actions the compact table needs.
 */
export function ServerRowActionsMenu({
  server,
  disabled,
  onOpenSetup,
  onOpenDetails,
  onEdit,
  onDelete,
}: ServerRowActionsMenuProps) {
  const linkItemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]";

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
          <Link
            href={`/terminal?serverId=${server.id}`}
            onClick={close}
            className={linkItemCls}
            role="menuitem"
          >
            <Terminal size={14} /> Enter Terminal
          </Link>
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
