"use client";

import dynamic from "next/dynamic";
import { TerminalSquare } from "lucide-react";
import { Modal } from "@/shared/ui/modal";
import type { Server } from "@/features/servers/types/server";

// xterm est client-only.
const SshTerminal = dynamic(
  () => import("@/features/terminal").then((m) => m.SshTerminal),
  { ssr: false },
);

/**
 * Terminal SSH d'un serveur EN DIALOG (Phase 1.2, mission finale) — remplace la
 * redirection vers la page /terminal depuis le menu Serveurs, alignée sur
 * ServiceTerminalDialog. Le serverId étant déjà connu ici, aucune résolution
 * d'environnement n'est nécessaire.
 */
export function ServerTerminalDialog({
  server,
  open,
  onClose,
}: {
  server: Server | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Terminal${server ? ` — ${server.name}` : ""}`}
      description={
        server ? `${server.username}@${server.host}:${server.port}` : undefined
      }
      icon={
        <TerminalSquare size={16} className="text-secondary" />
      }
      contentClassName="!p-0"
    >
      <div className="h-[72vh] p-3">
        {open && server ? (
          <SshTerminal serverId={server.id} onClose={onClose} />
        ) : null}
      </div>
    </Modal>
  );
}
