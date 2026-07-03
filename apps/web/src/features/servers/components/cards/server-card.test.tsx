import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServerCard } from "./server-card";
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
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  } as Server;
}

const baseProps = {
  isBusy: false,
  verifyingId: null,
  detectingId: null,
  preparingId: null,
  installingKeyId: null,
  deletingId: null,
  updatingId: null,
  formatConnectionMode: () => "SSH",
  onVerify: vi.fn().mockResolvedValue(undefined),
  onDetect: vi.fn().mockResolvedValue(undefined),
  onInstallKey: vi.fn(),
  onOpenPrepare: vi.fn(),
  onOpenDetails: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

// A3: the reachability dot is a distinct signal from isVerified/status —
// these tests lock in that it reflects `isReachable` specifically, with its
// own 3-state (checking/reachable/unreachable) independent of the server's
// validation state.
describe("ServerCard — live reachability dot (Task A3)", () => {
  it("shows a 'checking' indicator when isReachable is not yet known", () => {
    render(<ServerCard {...baseProps} server={makeServer()} />);
    expect(screen.getByTitle("Reachability: checking…")).toBeInTheDocument();
  });

  it("shows a reachable indicator when the live ping succeeded", () => {
    render(
      <ServerCard {...baseProps} server={makeServer()} isReachable={true} />,
    );
    expect(
      screen.getByTitle("Reachable (live TCP check)"),
    ).toBeInTheDocument();
  });

  it("shows an unreachable indicator even when the server's last preparation status was healthy", () => {
    // A4 removed the old static "SSH validated" badge (superseded by this
    // live dot) and replaced the raw-enum status badge with a clear label —
    // the two signals (live reachability vs. last-known preparation level)
    // must coexist without either masking the other.
    render(
      <ServerCard
        {...baseProps}
        server={makeServer({ isVerified: true, status: "PREPARED" })}
        isReachable={false}
      />,
    );
    expect(
      screen.getByTitle("Unreachable (live TCP check)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Server ready")).toBeInTheDocument();
  });
});
