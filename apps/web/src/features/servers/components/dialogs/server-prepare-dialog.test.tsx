import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ServerPrepareDialog } from "./server-prepare-dialog";
import { serversService } from "@/features/servers/api/servers.service";
import type { Server } from "@/features/servers/types/server";

vi.mock("@/features/servers/api/servers.service", () => ({
  serversService: {
    getPreparationReadiness: vi.fn(),
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
    noActivePreparation: true,
  },
};

// P3 (mission finale, D4) : le dialog Setup Server n'a plus de cases ni de
// profil — une liste fixe (lecture seule) de ce qui est installé + un bouton
// "Setup Server" (jeu fixe) + un bouton "Setup Monitoring" séparé.
describe("ServerPrepareDialog — fixed Setup Server (P3)", () => {
  beforeEach(() => vi.clearAllMocks());

  function renderDialog(props: Record<string, unknown> = {}) {
    return render(
      <ServerPrepareDialog
        open
        server={server}
        isBusy={false}
        preparingId={null}
        onClose={vi.fn()}
        onPrepare={vi.fn()}
        {...props}
      />,
      { wrapper: setup() },
    );
  }

  it("shows the fixed install list and both action buttons, no checkboxes", async () => {
    mocked.getPreparationReadiness.mockResolvedValue(ready as never);
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText("Docker TLS Connection")).toBeInTheDocument(),
    );
    expect(screen.getByText("Nixpacks")).toBeInTheDocument();
    // Deux actions, un jeu fixe (pas de sélection).
    expect(
      screen.getByRole("button", { name: "Setup Server" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Setup Monitoring" }),
    ).toBeInTheDocument();
    // Plus aucune case à cocher ni sélecteur de profil.
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(document.querySelector("select")).toBeNull();
  });

  it("runs Setup Server with the fixed essential payload", async () => {
    mocked.getPreparationReadiness.mockResolvedValue(ready as never);
    const onPrepare = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onPrepare });

    const btn = await screen.findByRole("button", { name: "Setup Server" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(onPrepare).toHaveBeenCalledTimes(1);
    const [, payload] = onPrepare.mock.calls[0];
    expect(payload).toMatchObject({
      docker: true,
      dockerTls: true,
      nixpacks: true,
      firewall: true,
      securityHardening: true,
    });
    // Setup Server n'installe PAS nginx/postgres/redis/nodejs/backup.
    expect(payload.nginx).toBeUndefined();
    expect(payload.postgres).toBeUndefined();
  });

  it("runs Setup Monitoring with the monitoring payload", async () => {
    mocked.getPreparationReadiness.mockResolvedValue(ready as never);
    const onPrepare = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onPrepare });

    const btn = await screen.findByRole("button", { name: "Setup Monitoring" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    const [, payload] = onPrepare.mock.calls[0];
    expect(payload).toMatchObject({ monitoring: true });
    expect(payload.docker).toBeUndefined();
  });

  it("blocks and offers 'Validate SSH now' when SSH validation is the blocker", async () => {
    mocked.getPreparationReadiness.mockResolvedValue({
      isReady: false,
      blockingReasons: ["La validation SSH doit réussir avant la préparation."],
      checks: {
        serverActive: true,
        serverNotDisabled: true,
        sshValidated: false,
        sshReachable: false,
        authSucceeded: false,
        sudoAvailable: false,
        noActivePreparation: true,
      },
    } as never);
    const onVerify = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onVerify, verifyingId: null });

    const verify = await screen.findByText("Validate SSH now");
    fireEvent.click(verify);
    expect(onVerify).toHaveBeenCalledWith(server);
    // Bloqué : le bouton Setup Server est désactivé.
    expect(screen.getByRole("button", { name: "Setup Server" })).toBeDisabled();
  });

  it("hides 'Validate SSH now' when SSH is validated but another blocker applies", async () => {
    mocked.getPreparationReadiness.mockResolvedValue({
      isReady: false,
      blockingReasons: ["Une préparation serveur est déjà en cours."],
      checks: {
        serverActive: true,
        serverNotDisabled: true,
        sshValidated: true,
        sshReachable: true,
        authSucceeded: true,
        sudoAvailable: true,
        noActivePreparation: false,
      },
    } as never);
    renderDialog({ onVerify: vi.fn(), verifyingId: null });

    await screen.findByText("Setup blocked");
    expect(screen.queryByText("Validate SSH now")).not.toBeInTheDocument();
  });
});
