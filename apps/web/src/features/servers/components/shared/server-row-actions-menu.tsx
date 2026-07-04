"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
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
 * Compact "⋯" actions menu for a server table row (Task 2, "Sécurité
 * database + UI" mission) — replaces the old inline button row
 * (server-actions.tsx / server-card.tsx, both removed) with exactly the 5
 * actions the compact table needs. Click-outside-to-close mirrors the same
 * pattern already used by ServiceEnvironmentSelector for consistency.
 */
export function ServerRowActionsMenu({
  server,
  disabled,
  onOpenSetup,
  onOpenDetails,
  onEdit,
  onDelete,
}: ServerRowActionsMenuProps) {
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

  const itemCls =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)]";

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={`Actions for ${server.name}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1.5 shadow-2xl">
          <Link
            href={`/terminal?serverId=${server.id}`}
            onClick={() => setOpen(false)}
            className={itemCls}
          >
            <Terminal size={14} /> Enter Terminal
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSetup(server);
            }}
            className={itemCls}
          >
            <Wrench size={14} /> Setup Server
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit(server);
            }}
            className={itemCls}
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenDetails(server);
            }}
            className={itemCls}
          >
            <Eye size={14} /> View Details
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete(server);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
