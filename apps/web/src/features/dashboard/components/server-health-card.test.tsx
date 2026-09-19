import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServerHealthCard } from "./server-health-card";

// E8 : la feature dashboard n'avait AUCUN test — on verrouille la logique de
// visibilité (admin + serveurs > 0) et l'affichage des compteurs.
describe("ServerHealthCard", () => {
  const servers = { total: 4, ready: 2, preparing: 1, error: 1, offline: 0 };

  it("renders nothing for non-admin users", () => {
    const { container } = render(
      <ServerHealthCard servers={servers} isAdmin={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no servers", () => {
    const { container } = render(
      <ServerHealthCard
        servers={{ total: 0, ready: 0, preparing: 0, error: 0, offline: 0 }}
        isAdmin
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows totals, per-status counters and the servers link for admins", () => {
    render(<ServerHealthCard servers={servers} isAdmin />);
    expect(screen.getByText("Servers (4)")).toBeInTheDocument();
    expect(screen.getByText("Prêt")).toBeInTheDocument();
    expect(screen.getByText("Provisionnement")).toBeInTheDocument();
    expect(screen.getByText("En erreur")).toBeInTheDocument();
    expect(screen.getByText("Hors ligne")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/admin/servers");
  });
});
