"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Server,
  Terminal,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Button } from "@/shared/ui/button";
import { serversService } from "@/features/servers";
import { getApiErrorMessage } from "@/shared/lib/api";
import type { Server as RemoteServer } from "@/features/servers";

// xterm.js must be rendered client-side only
const SshTerminal = dynamic(
  () => import("./ssh-terminal").then((m) => m.SshTerminal),
  { ssr: false },
);

export function TerminalHub() {
  const { isAdmin } = useAuth();
  // Task 2 ("Sécurité database + UI" mission): the server table's "Enter
  // Terminal" row action links here with ?serverId=<id> to preselect it,
  // instead of always defaulting to the first verified server.
  const searchParams = useSearchParams();
  const preselectServerId = searchParams.get("serverId");
  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const all = await serversService.getAll();
      setServers(all);
      const preselected = preselectServerId
        ? all.find((s) => s.id === preselectServerId)
        : undefined;
      const first = preselected ?? all.find((s) => s.isVerified) ?? all[0];
      if (first) setSelectedServerId(first.id);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, preselectServerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConnect = () => {
    setActiveServerId(selectedServerId);
  };

  const handleClose = () => {
    setActiveServerId(null);
  };

  const selected = servers.find((s) => s.id === selectedServerId);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operations"
          title="Terminal SSH"
          description="Administrators only."
        />
        <SectionCard>
          <div className="flex items-center gap-3 text-sm text-secondary">
            <AlertCircle size={16} className="text-yellow-400" />
            The SSH terminal is restricted to platform administrators.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <PageHeader
        eyebrow="Operations"
        title="Terminal SSH"
        description="Connect to a VPS and run commands in real time over SSH."
        actions={
          <Button
            variant="secondary"
            icon={
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            }
            onClick={() => void load()}
            disabled={loading || !!activeServerId}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Server selector (visible only when no active session) */}
      {!activeServerId && (
        <SectionCard
          title="SSH Connection"
          description="Select a validated VPS and open an interactive session."
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2
                size={20}
                className="animate-spin text-secondary"
              />
            </div>
          ) : servers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <Server className="mx-auto mb-2 h-8 w-8 text-secondary" />
              <p className="text-sm text-secondary">
                No VPS configured.
              </p>
              <Link
                href="/admin/servers"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-primary transition hover:bg-hover/10"
              >
                <Server size={14} /> Configure VPS
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-secondary">
                  VPS cible
                </label>
                <select
                  value={selectedServerId}
                  onChange={(e) => setSelectedServerId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-border bg-card px-4 text-sm text-primary outline-none transition focus:ring-2 focus:ring-accent/20"
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id} disabled={!s.isVerified}>
                      {s.name} ({s.username}@{s.host}:{s.port})
                      {!s.isVerified ? " — not verified" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="rounded-lg border border-border bg-hover/10 px-4 py-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs text-secondary">
                    <span>
                      Host:{" "}
                      <span className="text-primary">
                        {selected.host}
                      </span>
                    </span>
                    <span>
                      Port:{" "}
                      <span className="text-primary">
                        {selected.port}
                      </span>
                    </span>
                    <span>
                      User:{" "}
                      <span className="text-primary">
                        {selected.username}
                      </span>
                    </span>
                    <span>
                      Status:{" "}
                      <span
                        className={
                          selected.isVerified
                            ? "text-green-400"
                            : "text-yellow-400"
                        }
                      >
                        {selected.isVerified ? "Verified" : "Not verified"}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={handleConnect}
                disabled={!selectedServerId || !selected?.isVerified}
                icon={<Terminal size={14} />}
              >
                Open SSH session
              </Button>

              {selected && !selected.isVerified && (
                <p className="text-xs text-yellow-400">
                  This server is not validated yet. Validate it first in{" "}
                  <Link href="/admin/servers" className="underline">
                    Servers
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {/* Active terminal */}
      {activeServerId && (
        <div className="flex-1 overflow-hidden">
          <SshTerminal serverId={activeServerId} onClose={handleClose} />
        </div>
      )}
    </div>
  );
}
