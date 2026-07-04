import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ServerPrepareDialog } from "./server-prepare-dialog";
import { serversService } from "@/features/servers/api/servers.service";
import type { Server } from "@/features/servers/types/server";

vi.mock("@/features/servers/api/servers.service", () => ({
  serversService: {
    getPreparationOptions: vi.fn(),
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

// A5: the dropdown used to show only the raw profile enum ("WEB") with zero
// description — a user could only learn what a profile did by selecting it
// and diffing the checkbox grid. This locks in the tagline + dynamic summary
// derived from the real profileDefaults (not a static/hardcoded list).
describe("ServerPrepareDialog — profile clarity (Task A5)", () => {
  it("shows a one-line tagline for each profile in the dropdown", async () => {
    mocked.getPreparationOptions.mockResolvedValue({
      controlNodeOnly: true,
      message: "",
      profiles: ["BASIC", "WEB"],
      options: [
        { key: "docker", label: "Docker", description: "", role: "docker", dependencies: [], recommended: true },
        { key: "nginx", label: "Nginx", description: "", role: "nginx", dependencies: [], recommended: false },
      ],
      profileDefaults: {
        BASIC: { docker: true },
        WEB: { docker: true, nginx: true },
      },
    } as never);
    mocked.getPreparationReadiness.mockResolvedValue({
      isReady: true,
      blockingReasons: [],
    } as never);

    render(
      <ServerPrepareDialog
        open
        server={server}
        prepareOptions={{}}
        isBusy={false}
        preparingId={null}
        onClose={vi.fn()}
        onFieldChange={vi.fn()}
        onPrepare={vi.fn()}
      />,
      { wrapper: setup() },
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Recommended baseline — hardening only/),
      ).toBeInTheDocument(),
    );
  });

  it("shows a dynamic summary of what the selected profile enables, from the real profileDefaults", async () => {
    mocked.getPreparationOptions.mockResolvedValue({
      controlNodeOnly: true,
      message: "",
      profiles: ["WEB"],
      options: [
        { key: "docker", label: "Docker", description: "", role: "docker", dependencies: [], recommended: true },
        { key: "nginx", label: "Nginx", description: "", role: "nginx", dependencies: [], recommended: false },
        { key: "redis", label: "Redis", description: "", role: "redis", dependencies: [], recommended: false },
      ],
      profileDefaults: {
        WEB: { docker: true, nginx: true, redis: false },
      },
    } as never);
    mocked.getPreparationReadiness.mockResolvedValue({
      isReady: true,
      blockingReasons: [],
    } as never);

    render(
      <ServerPrepareDialog
        open
        server={server}
        prepareOptions={{ profile: "WEB" }}
        isBusy={false}
        preparingId={null}
        onClose={vi.fn()}
        onFieldChange={vi.fn()}
        onPrepare={vi.fn()}
      />,
      { wrapper: setup() },
    );

    // The summary line must list exactly Docker + Nginx — Redis is false in
    // profileDefaults for WEB, so it must be absent from THIS specific text
    // (it still legitimately appears elsewhere, as an unchecked option in
    // the checkbox grid below).
    await waitFor(() =>
      expect(
        screen.getByText("Enables by default: Docker, Nginx."),
      ).toBeInTheDocument(),
    );
  });

  // "Sécurité database + UI" mission, Task 2: the compact server table no
  // longer has its own "Validate SSH" row action (only 5 fixed actions) —
  // folded here instead, inline, exactly where the dialog already explains
  // SSH validation is what's blocking Setup Server.
  describe("inline 'Validate SSH now' (Task 2)", () => {
    beforeEach(() => {
      mocked.getPreparationOptions.mockResolvedValue({
        controlNodeOnly: true,
        message: "",
        profiles: ["BASIC"],
        options: [],
        profileDefaults: { BASIC: {} },
      } as never);
    });

    it("shows a 'Validate SSH now' button when SSH validation is the blocker, and calls onVerify", async () => {
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

      render(
        <ServerPrepareDialog
          open
          server={server}
          prepareOptions={{}}
          isBusy={false}
          preparingId={null}
          onVerify={onVerify}
          verifyingId={null}
          onClose={vi.fn()}
          onFieldChange={vi.fn()}
          onPrepare={vi.fn()}
        />,
        { wrapper: setup() },
      );

      const button = await screen.findByText("Validate SSH now");
      button.click();
      expect(onVerify).toHaveBeenCalledWith(server);
    });

    it("does not show the button when SSH is already validated (a different blocker applies)", async () => {
      mocked.getPreparationReadiness.mockResolvedValue({
        isReady: false,
        blockingReasons: ["Une préparation serveur est déjà en cours pour ce VPS."],
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

      render(
        <ServerPrepareDialog
          open
          server={server}
          prepareOptions={{}}
          isBusy={false}
          preparingId={null}
          onVerify={vi.fn()}
          verifyingId={null}
          onClose={vi.fn()}
          onFieldChange={vi.fn()}
          onPrepare={vi.fn()}
        />,
        { wrapper: setup() },
      );

      await screen.findByText("Setup blocked");
      expect(screen.queryByText("Validate SSH now")).not.toBeInTheDocument();
    });
  });
});
