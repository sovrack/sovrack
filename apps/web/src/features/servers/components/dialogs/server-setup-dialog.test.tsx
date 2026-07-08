import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ServerSetupDialog } from "./server-setup-dialog";
import { serversService } from "@/features/servers/api/servers.service";
import type { Server } from "@/features/servers/types/server";

vi.mock("@/features/servers/api/servers.service", () => ({
  serversService: {
    getSetupReadiness: vi.fn(),
    getSetupOptions: vi.fn(),
  },
}));

const mocked = vi.mocked(serversService);

const setupOptions = {
  controlNodeOnly: true,
  message: "",
  profiles: [],
  profileDefaults: {},
  options: [
    {
      key: "reverseProxy",
      label: "Reverse Proxy (Traefik + HTTPS)",
      description: "Install Traefik on ports 80/443 with automatic HTTPS.",
      role: "traefik",
      dependencies: ["docker"],
      recommended: false,
    },
    {
      key: "gitlabRunner",
      label: "GitLab Runner",
      description: "Install GitLab Runner.",
      role: "gitlab_runner",
      dependencies: ["systemUpdate"],
      recommended: false,
    },
  ],
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
}

const server = {
  id: "s1",
  name: "vps-1",
  host: "10.0.0.1",
  port: 22,
  username: "ubuntu",
} as Server;

const ready = {
  isReady: true,
  blockingReasons: [],
  checks: {
    serverActive: true,
    serverNotDisabled: true,
    sshValidated: true,
    sshReachable: true,
    authSucceeded: true,
    sudoAvailable: true,
    noActiveSetup: true,
  },
};

// D4 (rework) : "Setup Server" installe un jeu fixe (lecture seule) + une
// liste à cocher pour les options avancées (Reverse Proxy, GitLab Runner),
// sourcée du catalogue backend, + un "Monitoring stack" CHAÎNÉ après le
// setup (même action que la page Monitoring, pas le rôle agent léger —
// voir server-setup-dialog.tsx).
describe("ServerSetupDialog — fixed core + optional checkboxes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getSetupOptions.mockResolvedValue(setupOptions as never);
  });

  function renderDialog(props: Record<string, unknown> = {}) {
    return render(
      <ServerSetupDialog
        open
        server={server}
        isBusy={false}
        settingUpId={null}
        onClose={vi.fn()}
        onStartSetup={vi.fn()}
        {...props}
      />,
      { wrapper: setup() },
    );
  }

  it("shows the fixed install list, a single Setup Server button, and the optional checkboxes", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText("Docker TLS Connection")).toBeInTheDocument(),
    );
    expect(screen.getByText("Nixpacks")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Setup Server" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Setup Reverse Proxy" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Setup Monitoring" }),
    ).not.toBeInTheDocument();
    // Options avancées : cases à cocher, sourcées du catalogue backend.
    await waitFor(() =>
      expect(
        screen.getByText("Reverse Proxy (Traefik + HTTPS)"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("GitLab Runner")).toBeInTheDocument();
    // Reverse Proxy + GitLab Runner (Ansible extras) + Monitoring stack
    // (chained, separate action) = 3 checkboxes.
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      3,
    );
    // The lightweight "monitoring" agent role is never offered — only the
    // real Grafana/Prometheus/Loki stack, as its own checkbox.
    expect(screen.queryByText("Monitoring agent")).not.toBeInTheDocument();
    expect(screen.getByText("Monitoring stack")).toBeInTheDocument();
  });

  it("runs Setup Server with the fixed essential payload when no extra is checked", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    const btn = await screen.findByRole("button", { name: "Setup Server" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(onStartSetup).toHaveBeenCalledTimes(1);
    const [, payload] = onStartSetup.mock.calls[0];
    expect(payload).toMatchObject({
      docker: true,
      dockerTls: true,
      nixpacks: true,
      firewall: true,
      securityHardening: true,
    });
    // Setup Server n'installe PAS nginx/postgres/redis/nodejs/backup/monitoring.
    expect(payload.nginx).toBeUndefined();
    expect(payload.postgres).toBeUndefined();
    expect(payload.reverseProxy).toBeUndefined();
    expect(payload.gitlabRunner).toBeUndefined();
    expect((payload as Record<string, unknown>).monitoring).toBeUndefined();
  });

  it("bundles Reverse Proxy into the same Setup Server run when checked", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    await waitFor(() =>
      expect(
        screen.getByText("Reverse Proxy (Traefik + HTTPS)"),
      ).toBeInTheDocument(),
    );
    const [reverseProxyCheckbox] = document.querySelectorAll(
      'input[type="checkbox"]',
    );
    fireEvent.click(reverseProxyCheckbox);

    const btn = screen.getByRole("button", { name: "Setup Server" });
    fireEvent.click(btn);
    const [, payload] = onStartSetup.mock.calls[0];
    expect(payload).toMatchObject({ reverseProxy: true, docker: true });
  });

  it("bundles GitLab Runner into the same Setup Server run when checked", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    await waitFor(() =>
      expect(screen.getByText("GitLab Runner")).toBeInTheDocument(),
    );
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[1]);

    const btn = screen.getByRole("button", { name: "Setup Server" });
    fireEvent.click(btn);
    const [, payload] = onStartSetup.mock.calls[0];
    expect(payload).toMatchObject({ gitlabRunner: true, docker: true });
  });

  it("passes wantsMonitoring=true when the Monitoring stack checkbox is checked, without adding it to the Ansible payload", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    await waitFor(() =>
      expect(screen.getByText("GitLab Runner")).toBeInTheDocument(),
    );
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    // Reverse Proxy, GitLab Runner, Monitoring stack — in that render order.
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[2]);

    const btn = screen.getByRole("button", { name: "Setup Server" });
    fireEvent.click(btn);
    expect(onStartSetup).toHaveBeenCalledTimes(1);
    const [, payload, wantsMonitoring] = onStartSetup.mock.calls[0];
    expect(wantsMonitoring).toBe(true);
    expect((payload as Record<string, unknown>).monitoring).toBeUndefined();
  });

  it("passes wantsMonitoring=false by default", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    const btn = await screen.findByRole("button", { name: "Setup Server" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    const [, , wantsMonitoring] = onStartSetup.mock.calls[0];
    expect(wantsMonitoring).toBe(false);
  });

  it("blocks and offers Validate SSH when SSH validation is the blocker", async () => {
    mocked.getSetupReadiness.mockResolvedValue({
      isReady: false,
      blockingReasons: ["La validation SSH doit réussir avant la préparation."],
      checks: {
        serverActive: true,
        serverNotDisabled: true,
        sshValidated: false,
        sshReachable: false,
        authSucceeded: false,
        sudoAvailable: false,
        noActiveSetup: true,
      },
    } as never);
    const onVerify = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onVerify, verifyingId: null });

    const verify = await screen.findByText("Validate SSH");
    fireEvent.click(verify);
    expect(onVerify).toHaveBeenCalledWith(server);
    // Bloqué : le bouton Setup Server est désactivé.
    expect(screen.getByRole("button", { name: "Setup Server" })).toBeDisabled();
  });

  it("still offers Validate SSH when SSH is validated but another blocker applies", async () => {
    mocked.getSetupReadiness.mockResolvedValue({
      isReady: false,
      blockingReasons: ["Une préparation serveur est déjà en cours."],
      checks: {
        serverActive: true,
        serverNotDisabled: true,
        sshValidated: true,
        sshReachable: true,
        authSucceeded: true,
        sudoAvailable: true,
        noActiveSetup: false,
      },
    } as never);
    renderDialog({ onVerify: vi.fn(), verifyingId: null });

    await screen.findByText("Setup blocked");
    expect(screen.getByText("Validate SSH")).toBeInTheDocument();
  });
});
