"use client";

import { Activity, Check, Globe, Wrench, Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { useSetupReadiness } from "@/features/servers/api/use-servers";
import type {
  Server,
  StartServerSetupPayload,
} from "@/features/servers/types/server";

export type PrepareOptions = StartServerSetupPayload;

// P3 (mission finale, décision D4) : plus de cases à cocher ni de profil. Deux
// actions à jeu FIXE, choisi par la plateforme :
//  - "Setup Server" installe l'ensemble essentiel pour rendre le serveur
//    déployable + sécurisé (un serveur peut builder n'importe quelle app dès le
//    départ grâce à Docker + Nixpacks ; docker_tls le rend pilotable par la
//    plateforme). Volontairement SANS nginx/certbot (conflit Traefik),
//    postgres/redis/nodejs hôte (lancés en conteneurs) ni backup (obsolète).
//  - "Setup Monitoring" installe la brique d'observabilité, séparément.
// gitlab_runner (transformer le VPS en runner CI) reste une action avancée non
// exposée ici.
const SETUP_SERVER_PAYLOAD: StartServerSetupPayload = {
  profile: "CUSTOM",
  systemUpdate: true,
  docker: true,
  dockerComposePlugin: true,
  dockerTls: true,
  nixpacks: true,
  firewall: true,
  fail2ban: true,
  swap: true,
  logrotate: true,
  securityHardening: true,
  autoUpdates: true,
};

const SETUP_MONITORING_PAYLOAD: StartServerSetupPayload = {
  profile: "CUSTOM",
  monitoring: true,
};

// P3.5 (D5) : reverse proxy Traefik + Let's Encrypt (HTTPS automatique).
const SETUP_REVERSE_PROXY_PAYLOAD: StartServerSetupPayload = {
  profile: "CUSTOM",
  docker: true,
  reverseProxy: true,
};

// Liste lisible de ce que "Setup Server" installe (lecture seule, informative).
const SERVER_TOOLS: { label: string; desc: string }[] = [
  { label: "System base", desc: "apt cache + essential packages" },
  { label: "Docker Engine + Compose", desc: "container runtime" },
  {
    label: "Docker TLS Connection",
    desc: "lets the platform deploy here automatically (mTLS 2376) — required",
  },
  { label: "Nixpacks", desc: "build container images without a Dockerfile" },
  { label: "UFW firewall", desc: "deny-by-default with safe ports (22/80/443)" },
  { label: "Fail2ban", desc: "SSH brute-force protection" },
  { label: "Swap", desc: "swap file when missing" },
  { label: "Log rotation", desc: "sane logrotate defaults" },
  {
    label: "Security hardening",
    desc: "SSH/sysctl hardening + automatic security updates",
  },
];

type ServerSetupDialogProps = {
  open: boolean;
  server: Server | null;
  isBusy: boolean;
  preparingId: string | null;
  // "Validate SSH" est repliée ici (le tableau serveurs n'a que 5 actions) :
  // proposée inline quand la validation SSH est le prérequis bloquant.
  onVerify?: (server: Server) => Promise<void>;
  verifyingId?: string | null;
  onClose: () => void;
  onPrepare: (
    server: Server,
    options: StartServerSetupPayload,
  ) => Promise<void>;
};

export function ServerSetupDialog({
  open,
  server,
  isBusy,
  preparingId,
  onVerify,
  verifyingId,
  onClose,
  onPrepare,
}: ServerSetupDialogProps) {
  const readinessQuery = useSetupReadiness(
    open && server ? server.id : "",
  );

  if (!server) return null;

  const readiness = readinessQuery.data;
  const readinessLoading =
    readinessQuery.isLoading || readinessQuery.isFetching;
  const readinessError = readinessQuery.error
    ? "Unable to check provisioning prerequisites right now."
    : null;
  const blockingReasons = readinessLoading
    ? ["Checking setup prerequisites..."]
    : readinessError
      ? [readinessError]
      : (readiness?.blockingReasons ?? []);
  const isReady =
    !readinessLoading && !readinessError && Boolean(readiness?.isReady);
  const needsSshValidation = Boolean(
    readiness?.checks &&
      (!readiness.checks.sshValidated ||
        !readiness.checks.sshReachable ||
        !readiness.checks.authSucceeded),
  );
  const busyThis = preparingId === server.id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissable={!isBusy}
      size="lg"
      title="Setup Server"
      description={`${server.username}@${server.host}:${server.port}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            onClick={() => void onPrepare(server, SETUP_SERVER_PAYLOAD)}
            disabled={isBusy || !isReady}
            loading={busyThis}
            icon={busyThis ? undefined : <Wrench size={14} />}
          >
            Setup Server
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          Ansible runs from the platform control node. The target VPS stays an
          agentless SSH host — nothing is installed on it to manage it. The set
          below is fixed (no choices): it makes the server deployable and
          secure.
        </div>

        {/* Ce que Setup Server installe (lecture seule) */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
            Installs
          </p>
          <ul className="space-y-1.5">
            {SERVER_TOOLS.map((t) => (
              <li key={t.label} className="flex items-start gap-2 text-sm">
                <Check
                  size={14}
                  className="mt-0.5 shrink-0 text-green-400"
                  aria-hidden
                />
                <span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {t.label}
                  </span>
                  <span className="text-[var(--text-secondary)]">
                    {" "}
                    — {t.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions optionnelles séparées */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Reverse Proxy — HTTPS (optional)
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Install Traefik (80/443) with automatic Let’s Encrypt
              certificates. Services with a domain then get HTTPS at deploy.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy || !isReady}
            loading={busyThis}
            onClick={() => void onPrepare(server, SETUP_REVERSE_PROXY_PAYLOAD)}
            icon={busyThis ? undefined : <Globe size={13} />}
          >
            Setup Reverse Proxy
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Monitoring (optional)
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Install the observability agent on this server, separately from
              the core setup.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy || !isReady}
            loading={busyThis}
            onClick={() => void onPrepare(server, SETUP_MONITORING_PAYLOAD)}
            icon={busyThis ? undefined : <Activity size={13} />}
          >
            Setup Monitoring
          </Button>
        </div>

        {!isReady && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Setup blocked</p>
              {needsSshValidation && onVerify && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onVerify(server)}
                  loading={verifyingId === server.id}
                  icon={
                    verifyingId === server.id ? undefined : <Zap size={13} />
                  }
                >
                  Validate SSH now
                </Button>
              )}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {blockingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
