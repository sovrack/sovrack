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
  // Regression: this used to filter down to INSTALLED-only, silently hiding
  // anything MISSING — a missing tool looked identical to "never checked".
  it("shows a badge for every detected tool, installed AND missing", () => {
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
    // Missing must be VISIBLE (as missing), not hidden.
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
  });

  it("shows a helpful message instead of a generic badge when nothing is detected yet", () => {
    render(<ServerToolBadges server={makeServer([])} />);
    expect(
      screen.getByText(
        "No tools detected yet — detection runs automatically after SSH validation.",
      ),
    ).toBeInTheDocument();
  });

  it("never fabricates a badge for a tool absent from installedTools", () => {
    render(
      <ServerToolBadges
        server={makeServer([
          { toolKey: "docker", displayName: "Docker Engine", status: "INSTALLED" } as never,
        ])}
      />,
    );
    expect(screen.queryByText("Traefik")).not.toBeInTheDocument();
  });

  it("shows a Traefik badge when detected as INSTALLED", () => {
    render(
      <ServerToolBadges
        server={makeServer([
          { toolKey: "traefik", displayName: "Traefik", status: "INSTALLED" } as never,
        ])}
      />,
    );
    expect(screen.getByText("Traefik")).toBeInTheDocument();
  });
});
