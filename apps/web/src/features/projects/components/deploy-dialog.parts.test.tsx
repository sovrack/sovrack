import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeployValidationPanel } from "./deploy-dialog.parts";
import type { DeployValidationResult } from "@/features/deployments";

const baseValidation: DeployValidationResult = {
  ready: true,
  prepared: true,
  missing: [],
  required: [],
  serverName: "vps-prod",
  serverId: "srv1",
  buildSource: "DOCKERFILE_LOCAL",
};

const baseProps = {
  issues: [],
  loading: false,
  envIds: ["env1"],
  validating: false,
  validateError: null,
  onClose: vi.fn(),
};

// Regression tests for AUDIT_VERIFICATION_UI.md Point 10: `validation.reason`
// (DeploymentPreflightService's exact rejection message — missing Dockerfile,
// malformed secrets JSON, no registry credentials, port conflict…) was
// computed by the backend but never read by this panel, so a user only ever
// discovered the real blocking problem after clicking "Deploy" for real.
describe("DeployValidationPanel — preflight reason (Task 6)", () => {
  it("shows the precise reason message when the backend reports one", () => {
    render(
      <DeployValidationPanel
        {...baseProps}
        validation={{
          ...baseValidation,
          ready: false,
          reason: "Aucun Dockerfile trouvé sur la branche « main ».",
        }}
      />,
    );
    expect(screen.getByText("This deployment will fail")).toBeInTheDocument();
    expect(
      screen.getByText("Aucun Dockerfile trouvé sur la branche « main »."),
    ).toBeInTheDocument();
  });

  it("does not render the reason block when there is no reason", () => {
    render(
      <DeployValidationPanel {...baseProps} validation={baseValidation} />,
    );
    expect(
      screen.queryByText("This deployment will fail"),
    ).not.toBeInTheDocument();
  });

  it("links to the concerned service's config page when serviceConfigHref is provided (Task D3)", () => {
    render(
      <DeployValidationPanel
        {...baseProps}
        serviceConfigHref="/projects/proj-1/services/svc-1"
        validation={{
          ...baseValidation,
          ready: false,
          reason: "Build not configured for this service.",
        }}
      />,
    );
    const link = screen.getByText("Configure →").closest("a");
    expect(link).toHaveAttribute("href", "/projects/proj-1/services/svc-1");
  });

  it("omits the Configure link when no serviceConfigHref is resolvable", () => {
    render(
      <DeployValidationPanel
        {...baseProps}
        validation={{
          ...baseValidation,
          ready: false,
          reason: "Build not configured for this service.",
        }}
      />,
    );
    expect(screen.queryByText("Configure →")).not.toBeInTheDocument();
  });

  it("shows the reason even when the server is otherwise fully prepared with no missing tools", () => {
    // Exactly the case the old `(ready || missing.length === 0)` formula in
    // DeployDialog let slip through unnoticed: prepared=true, missing=[],
    // but a real preflight reason is set.
    render(
      <DeployValidationPanel
        {...baseProps}
        validation={{
          ...baseValidation,
          ready: false,
          prepared: true,
          missing: [],
          reason: "Le contenu docker-compose n'est pas un YAML valide.",
        }}
      />,
    );
    expect(screen.getByText("This deployment will fail")).toBeInTheDocument();
    expect(
      screen.getByText("All required tools are installed on vps-prod"),
    ).toBeInTheDocument();
  });
});
