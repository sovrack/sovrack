import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerRowActionsMenu } from "./server-row-actions-menu";
import type { Server } from "@/features/servers/types/server";

const server = {
  id: "s1",
  name: "vps-prod",
  host: "10.0.0.1",
  port: 22,
} as Server;

// The compact table's Actions column opens this menu — Enter Terminal /
// Validate SSH / Setup Server / Edit / View Details / Delete. "Detect Info"
// is no longer a manual action — detection now runs automatically right
// after a successful SSH validation (see servers-jobs.facade.ts).
// P1.2 (mission finale) : "Enter Terminal" ouvre désormais un DIALOG
// (callback onOpenTerminal) au lieu de rediriger vers /terminal.
describe("ServerRowActionsMenu", () => {
  it("shows all the specified actions when opened", () => {
    render(
      <ServerRowActionsMenu
        server={server}
        onOpenTerminal={vi.fn()}
        onOpenSetup={vi.fn()}
        onOpenDetails={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));

    expect(screen.getByText("Enter Terminal")).toBeInTheDocument();
    expect(screen.getByText("Validate SSH")).toBeInTheDocument();
    expect(screen.getByText("Setup Server")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("View Details")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("opens the terminal dialog (callback) instead of navigating", () => {
    const onOpenTerminal = vi.fn();
    render(
      <ServerRowActionsMenu
        server={server}
        onOpenTerminal={onOpenTerminal}
        onOpenSetup={vi.fn()}
        onOpenDetails={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    // Plus aucun lien de navigation : c'est un bouton d'action.
    expect(screen.getByText("Enter Terminal").closest("a")).toBeNull();
    fireEvent.click(screen.getByText("Enter Terminal"));
    expect(onOpenTerminal).toHaveBeenCalledWith(server);
  });

  it("calls onOpenSetup, onEdit, onOpenDetails, onDelete with the server", () => {
    const onOpenSetup = vi.fn();
    const onOpenDetails = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <ServerRowActionsMenu
        server={server}
        onOpenTerminal={vi.fn()}
        onOpenSetup={onOpenSetup}
        onOpenDetails={onOpenDetails}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Setup Server"));
    expect(onOpenSetup).toHaveBeenCalledWith(server);

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(server);

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("View Details"));
    expect(onOpenDetails).toHaveBeenCalledWith(server);

    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(server);
  });

  it("calls onValidateSsh with the server when provided", () => {
    const onValidateSsh = vi.fn();
    render(
      <ServerRowActionsMenu
        server={server}
        onOpenTerminal={vi.fn()}
        onOpenSetup={vi.fn()}
        onOpenDetails={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onValidateSsh={onValidateSsh}
      />,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    fireEvent.click(screen.getByText("Validate SSH"));
    expect(onValidateSsh).toHaveBeenCalledWith(server);
  });

  it("closes the menu when clicking outside", () => {
    render(
      <div>
        <ServerRowActionsMenu
          server={server}
          onOpenTerminal={vi.fn()}
          onOpenSetup={vi.fn()}
          onOpenDetails={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
        <div data-testid="outside">outside</div>
      </div>,
    );
    fireEvent.click(screen.getByLabelText("Actions for vps-prod"));
    expect(screen.getByText("Delete")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
});
