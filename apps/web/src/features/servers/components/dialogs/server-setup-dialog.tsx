"use client";

import { useState } from "react";
import { Activity, Check, GitBranch, Globe, Wrench, Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import {
  useSetupReadiness,
  useServerSetupOptions,
} from "@/features/servers/api/use-servers";
import type {
  Server,
  StartServerSetupPayload,
} from "@/features/servers/types/server";

export type SetupDialogOptions = StartServerSetupPayload;

// P3 (mission finale, décision D4) : "Setup Server" installe un jeu FIXE
// (pas de cases à cocher), choisi par la plateforme — un serveur peut builder
// n'importe quelle app dès le départ grâce à Docker + Nixpacks ; docker_tls le
// rend pilotable par la plateforme. Volontairement SANS nginx/certbot
// (conflit Traefik), postgres/redis/nodejs hôte (lancés en conteneurs) ni
// backup (obsolète).
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

// Options avancées, optionnelles, ajoutées à la même exécution si cochées.
// Le catalogue complet (useServerSetupOptions) contient aussi "monitoring" —
// volontairement exclu ici : ce rôle n'installe qu'un agent léger et ne
// débloque jamais les tableaux de bord Grafana/Prometheus/Loki. Le vrai
// stack (Grafana/Prometheus/Loki) est proposé séparément ci-dessous
// (`installMonitoring` state), CHAÎNÉ après le setup plutôt que fusionné
// dans ce run Ansible — même action que la page Monitoring, donc pas de
// "deux boutons qui ne font pas la même chose".
const EXTRA_OPTION_KEYS: (keyof StartServerSetupPayload)[] = [
  "reverseProxy",
  "gitlabRunner",
];

const EXTRA_OPTION_ICONS: Partial<
  Record<keyof StartServerSetupPayload, typeof Globe>
> = {
  reverseProxy: Globe,
  gitlabRunner: GitBranch,
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
  settingUpId: string | null;
  // "Validate SSH" est repliée ici (le tableau serveurs n'a que 5 actions) :
  // proposée inline quand la validation SSH est le prérequis bloquant.
  onVerify?: (server: Server) => Promise<void>;
  verifyingId?: string | null;
  onClose: () => void;
  // `wantsMonitoring`: the full Grafana/Prometheus/Loki stack (same action
  // as the Monitoring page), chained by the caller AFTER setup succeeds —
  // not merged into the same Ansible run, and NOT the lightweight
  // `monitoring` role (see EXTRA_OPTION_KEYS' comment below for why that one
  // stays excluded here).
  onStartSetup: (
    server: Server,
    options: StartServerSetupPayload,
    wantsMonitoring: boolean,
  ) => Promise<void>;
};

export function ServerSetupDialog({
  open,
  server,
  isBusy,
  settingUpId,
  onVerify,
  verifyingId,
  onClose,
  onStartSetup,
}: ServerSetupDialogProps) {
  const readinessQuery = useSetupReadiness(
    open && server ? server.id : "",
  );
  const optionsQuery = useServerSetupOptions();
  const [selectedExtras, setSelectedExtras] = useState<
    Partial<Record<keyof StartServerSetupPayload, boolean>>
  >({});
  const [installMonitoring, setInstallMonitoring] = useState(false);

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
  const busyThis = settingUpId === server.id;

  const extraOptions = (optionsQuery.data?.options ?? []).filter((o) =>
    EXTRA_OPTION_KEYS.includes(o.key),
  );

  const toggleExtra = (key: keyof StartServerSetupPayload) => {
    setSelectedExtras((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const runSetup = () => {
    const payload: StartServerSetupPayload = { ...SETUP_SERVER_PAYLOAD };
    // reverseProxy needs docker (already true above); each extra is just an
    // extra boolean on the same flat payload — resolveSetupOptions
    // (backend) fills in role dependencies on its own.
    for (const key of EXTRA_OPTION_KEYS) {
      if (selectedExtras[key]) {
        (payload as Record<string, unknown>)[key] = true;
      }
    }
    void onStartSetup(server, payload, installMonitoring);
  };

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
            onClick={runSetup}
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
          Managed via SSH from the control node — the fixed set below makes
          the server deployable and secure.
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

        {/* Options avancées : cases à cocher, ajoutées à la même exécution
            (Ansible extras) ou chaînées juste après (monitoring stack). */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
            Optional
          </p>
          <div className="space-y-2">
            {extraOptions.map((option) => {
              const Icon = EXTRA_OPTION_ICONS[option.key] ?? Globe;
              return (
                <label
                  key={option.key}
                  className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <Icon
                      size={14}
                      className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
                      aria-hidden
                    />
                    <span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {option.label}
                      </span>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {option.description}
                      </p>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedExtras[option.key])}
                    onChange={() => toggleExtra(option.key)}
                    disabled={isBusy || !isReady}
                    className="mt-1 shrink-0 accent-zinc-600"
                  />
                </label>
              );
            })}
            <label className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
              <span className="flex min-w-0 items-start gap-2">
                <Activity
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--text-secondary)]"
                  aria-hidden
                />
                <span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    Monitoring stack
                  </span>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Installs Grafana/Prometheus/Loki right after setup
                    completes (same action as the Monitoring page — can also
                    be installed later from there).
                  </p>
                </span>
              </span>
              <input
                type="checkbox"
                checked={installMonitoring}
                onChange={(e) => setInstallMonitoring(e.target.checked)}
                disabled={isBusy || !isReady}
                className="mt-1 shrink-0 accent-zinc-600"
              />
            </label>
          </div>
        </div>

        {!isReady && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">Setup blocked</p>
              {onVerify && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onVerify(server)}
                  loading={verifyingId === server.id}
                  icon={
                    verifyingId === server.id ? undefined : <Zap size={13} />
                  }
                >
                  Validate SSH
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
