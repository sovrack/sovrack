import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeploymentStatusBadge } from "./deployment-status-badge";

describe("DeploymentStatusBadge", () => {
  it("affiche le libellé du statut", () => {
    render(<DeploymentStatusBadge status="SUCCESS" />);
    expect(screen.getByText("Réussi")).toBeInTheDocument();
  });

  it("variante plain = forme bouton (fond carte), pas de pastille colorée", () => {
    const { container } = render(
      <DeploymentStatusBadge status="RUNNING" variant="plain" />,
    );
    const el = container.querySelector("span");
    expect(el?.className).toContain("bg-[var(--bg-card)]");
    expect(el?.className).not.toContain("rounded-full");
  });

  it("variante fill = pastille arrondie colorée", () => {
    const { container } = render(
      <DeploymentStatusBadge status="FAILED" variant="fill" />,
    );
    const el = container.querySelector("span");
    expect(el?.className).toContain("rounded-full");
  });
});
