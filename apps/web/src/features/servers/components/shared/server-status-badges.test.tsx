import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServerToolBadges } from "./server-status-badges";
import type { Server } from "@/features/servers/types/server";

function makeServer(installedTools: Server["installedTools"] = []): Server {
  return { installedTools } as Server;
}

// A4: real per-server tool badges — must reflect what capability detection
// actually found on THIS server (installedTools), not a generic/fixed pair.
describe("ServerToolBadges (Task A4)", () => {
  it("shows a badge only for tools with status INSTALLED", () => {
    render(
      <ServerToolBadges
        server={makeServer([
          { toolKey: "docker", displayName: "Docker Engine", status: "INSTALLED" } as never,
          { toolKey: "postgres", displayName: "PostgreSQL", status: "MISSING" } as never,
          { toolKey: "redis", displayName: "Redis", status: "INSTALLED" } as never,
        ])}
      />,
    );
    expect(screen.getByText("Docker Engine")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
    expect(screen.queryByText("PostgreSQL")).not.toBeInTheDocument();
  });

  it("shows a helpful message instead of a generic badge when nothing is detected yet", () => {
    render(<ServerToolBadges server={makeServer([])} />);
    expect(
      screen.getByText("No tools detected yet — run Detect Info."),
    ).toBeInTheDocument();
  });

  it("never fabricates a Traefik badge (not tracked as a per-server capability)", () => {
    render(
      <ServerToolBadges
        server={makeServer([
          { toolKey: "docker", displayName: "Docker Engine", status: "INSTALLED" } as never,
        ])}
      />,
    );
    expect(screen.queryByText(/traefik/i)).not.toBeInTheDocument();
  });
});
