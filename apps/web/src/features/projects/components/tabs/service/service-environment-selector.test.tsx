import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServiceEnvironmentSelector } from "./service-environment-selector";
import type { Environment } from "@/features/projects/types/environment";
import type { Service } from "@/features/projects/types/service";

const environments: Environment[] = [
  {
    id: "env-prod",
    name: "PRODUCTION",
    projectId: "p1",
    env: null,
    servers: [{ id: "srv-1", name: "vps-1", host: "1.2.3.4", status: "PREPARED" }],
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "env-staging",
    name: "STAGING",
    projectId: "p1",
    env: null,
    servers: [{ id: "srv-2", name: "vps-2", host: "5.6.7.8", status: "UNREACHABLE" }],
    createdAt: "",
    updatedAt: "",
  },
];

const envLinks: Service["envLinks"] = [
  {
    id: "senv-prod",
    environmentId: "env-prod",
    serverId: null,
    currentDeploymentId: null,
  },
  {
    id: "senv-staging",
    environmentId: "env-staging",
    serverId: null,
    currentDeploymentId: null,
  },
];

describe("ServiceEnvironmentSelector", () => {
  it("renders the currently selected environment on the trigger button", () => {
    render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={envLinks}
        environments={environments}
        selectedEnvId="env-prod"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("PRODUCTION")).toBeInTheDocument();
  });

  // Task 3 ("Correction rapide"): the trigger previously wrapped the
  // environment name in a per-environment colored pill (rounded-full +
  // colored border/bg from ENV_BADGE), making it stand out as its own
  // distinct colored element from the rest of the (plain) header. It's now
  // plain "Environment: X" text — only the dropdown list's own options still
  // color-code for scanability.
  it("shows the environment as plain 'Environment: X' text, not a colored pill, on the trigger", () => {
    render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={envLinks}
        environments={environments}
        selectedEnvId="env-prod"
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: /production/i });
    expect(trigger).toHaveTextContent("Environment: PRODUCTION");
    const pill = trigger.querySelector(".rounded-full");
    expect(pill).toBeNull();
  });

  it("lists every linked environment with a health indicator when opened", () => {
    render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={envLinks}
        environments={environments}
        selectedEnvId="env-prod"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /production/i }));
    expect(screen.getByText("vps-1")).toBeInTheDocument();
    expect(screen.getByText("vps-2")).toBeInTheDocument();
    expect(screen.getByTitle("Server reachable")).toBeInTheDocument();
    expect(screen.getByTitle("Server unreachable")).toBeInTheDocument();
  });

  it("calls onSelect with the environmentId when an option is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={envLinks}
        environments={environments}
        selectedEnvId="env-prod"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /production/i }));
    fireEvent.click(screen.getByText("vps-2"));
    expect(onSelect).toHaveBeenCalledWith("env-staging");
  });

  it("offers no creation option, only a link to manage project environments", () => {
    render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={envLinks}
        environments={environments}
        selectedEnvId="env-prod"
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /production/i }));
    expect(screen.queryByText(/add|create/i)).not.toBeInTheDocument();
    const link = screen.getByText(/manage project environments/i).closest("a");
    expect(link).toHaveAttribute(
      "href",
      "/projects/p1?openEnvironments=true",
    );
  });

  it("renders nothing when the service has no environment links", () => {
    const { container } = render(
      <ServiceEnvironmentSelector
        projectId="p1"
        envLinks={[]}
        environments={environments}
        selectedEnvId=""
        onSelect={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
