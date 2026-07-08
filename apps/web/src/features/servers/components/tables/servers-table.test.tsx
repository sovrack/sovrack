import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServersTable } from "./servers-table";
import type { Server } from "@/features/servers/types/server";

function makeServer(over: Partial<Server> = {}): Server {
  return {
    id: "s1",
    name: "vps-prod",
    host: "10.0.0.1",
    port: 22,
    username: "ubuntu",
    connectionMode: "ssh",
    isActive: true,
    isVerified: true,
    onboardingStep: "READY",
    status: "PREPARED",
    hasDocker: true,
    hasRunner: false,
    sshPublicKey: "ssh-ed25519 AAAA (unnamed)",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  } as Server;
}

const baseProps = {
  getServerBusy: () => false,
  onOpenTerminal: vi.fn(),
  onOpenSetup: vi.fn(),
  onOpenDetails: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

// Task 2 ("Sécurité database + UI" mission): the server list moved from
// large cards to a compact table with exactly these columns — this
// component replaces ServerCard (removed).
describe("ServersTable — columns (Task 2)", () => {
  it("shows Name / Status / IP Address / Port / Username / SSH Key / Created columns", () => {
    render(
      <ServersTable
        {...baseProps}
        servers={[makeServer()]}
        isReachable={{}}
      />,
    );
    expect(screen.getByText("vps-prod")).toBeInTheDocument();
    expect(screen.getByText("Server ready")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("ubuntu")).toBeInTheDocument();
    expect(screen.getByLabelText("SSH key configured")).toBeInTheDocument();
  });

  it("shows a 'no SSH key' indicator when the server has none configured", () => {
    render(
      <ServersTable
        {...baseProps}
        servers={[makeServer({ sshPublicKey: undefined })]}
        isReachable={{}}
      />,
    );
    expect(screen.getByLabelText("No SSH key")).toBeInTheDocument();
  });

  // A3 regression (ported from the removed ServerCard test): the
  // reachability dot is a distinct 3-state signal (checking/reachable/
  // unreachable), independent of the server's validation/setup status.
  it("shows a 'checking' indicator when reachability is not yet known", () => {
    render(
      <ServersTable {...baseProps} servers={[makeServer()]} isReachable={{}} />,
    );
    expect(screen.getByTitle("Reachability: checking…")).toBeInTheDocument();
  });

  it("shows a reachable indicator when the live ping succeeded", () => {
    render(
      <ServersTable
        {...baseProps}
        servers={[makeServer()]}
        isReachable={{ s1: true }}
      />,
    );
    expect(screen.getByTitle("Reachable (live TCP check)")).toBeInTheDocument();
  });

  it("shows an unreachable indicator even when the last setup status was healthy", () => {
    render(
      <ServersTable
        {...baseProps}
        servers={[makeServer({ status: "PREPARED" })]}
        isReachable={{ s1: false }}
      />,
    );
    expect(
      screen.getByTitle("Unreachable (live TCP check)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Server ready")).toBeInTheDocument();
  });

  it("does NOT show installed-tool badges (Docker/Nginx/…) — moved to View Details only", () => {
    render(
      <ServersTable
        {...baseProps}
        servers={[
          makeServer({
            installedTools: [
              {
                id: "tool1",
                serverId: "s1",
                toolKey: "docker",
                displayName: "Docker Engine",
                status: "INSTALLED",
                version: "1.0",
                installedAt: null,
                installedBy: null,
              },
            ],
          }),
        ]}
        isReachable={{}}
      />,
    );
    expect(screen.queryByText("Docker Engine")).not.toBeInTheDocument();
  });

  // Regression: onValidateSsh was declared in this component's props but
  // never destructured/forwarded to ServerRowActionsMenu, making the row
  // menu's "Validate SSH" item a silent no-op.
  it("forwards onValidateSsh to the row actions menu", () => {
    const onValidateSsh = vi.fn();
    render(
      <ServersTable
        {...baseProps}
        servers={[makeServer()]}
        isReachable={{}}
        onValidateSsh={onValidateSsh}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Validate SSH"));
    expect(onValidateSsh).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1" }),
    );
  });

});
