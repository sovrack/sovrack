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
  },
}));

const mocked = vi.mocked(serversService);

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

// Décision produit : "Setup Server" installe TOUT en un seul bouton, sans
// aucun choix — ni case à cocher, ni option. GitLab Runner et la stack
// d'observabilité (Prometheus/Grafana/Loki/Alertmanager) sont systématiques,
// au même titre que Docker ou le firewall.
describe("ServerSetupDialog — single button, zero checkboxes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("shows the full fixed install list (incl. GitLab Runner and the monitoring stack) with zero checkboxes", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText("Docker TLS Connection")).toBeInTheDocument(),
    );
    expect(screen.getByText("Nixpacks")).toBeInTheDocument();
    expect(
      screen.getByText("Reverse Proxy (Traefik + HTTPS)"),
    ).toBeInTheDocument();
    expect(screen.getByText("System diagnostics tools")).toBeInTheDocument();
    expect(screen.getByText("GitLab Runner")).toBeInTheDocument();
    expect(screen.getByText("Prometheus")).toBeInTheDocument();
    expect(screen.getByText("Grafana")).toBeInTheDocument();
    expect(screen.getByText("Loki")).toBeInTheDocument();
    expect(screen.getByText("Alertmanager")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Setup Server" }),
    ).toBeInTheDocument();

    // Aucun choix à faire : zéro case à cocher.
    expect(
      document.querySelectorAll('input[type="checkbox"]'),
    ).toHaveLength(0);
  });

  it("runs Setup Server with an empty payload — nothing to configure", async () => {
    mocked.getSetupReadiness.mockResolvedValue(ready as never);
    const onStartSetup = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onStartSetup });

    const btn = await screen.findByRole("button", { name: "Setup Server" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(onStartSetup).toHaveBeenCalledWith(server, {});
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
