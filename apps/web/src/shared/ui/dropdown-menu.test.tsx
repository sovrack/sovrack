import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DropdownMenu, DropdownItem, DropdownDivider } from "./dropdown-menu";

// Phase 1.1 (mission finale) : primitive portal partagé. Le menu doit être
// rendu HORS de l'arbre du déclencheur (dans document.body) pour échapper aux
// conteneurs overflow, et fermer au clic extérieur / Échap.
describe("DropdownMenu", () => {
  function setup(onPick = vi.fn()) {
    render(
      <div>
        <DropdownMenu
          label="Open menu"
          trigger={({ open }) => <span>{open ? "▲" : "▼"}</span>}
        >
          {({ close }) => (
            <>
              <DropdownItem
                onClick={() => {
                  onPick("edit");
                  close();
                }}
              >
                Edit
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem danger onClick={close}>
                Delete
              </DropdownItem>
            </>
          )}
        </DropdownMenu>
        <div data-testid="outside">outside</div>
      </div>,
    );
    return { onPick };
  }

  it("opens on trigger click and renders items in a portal (document.body)", () => {
    setup();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Open menu"));
    const edit = screen.getByText("Edit");
    expect(edit).toBeInTheDocument();
    // Rendu dans un portal : l'item n'est PAS un descendant du bouton trigger.
    expect(
      screen.getByLabelText("Open menu").contains(edit),
    ).toBe(false);
  });

  it("invokes the item handler and closes", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getByLabelText("Open menu"));
    fireEvent.click(screen.getByText("Edit"));
    expect(onPick).toHaveBeenCalledWith("edit");
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("closes on outside click", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Delete")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Delete")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("does not open when disabled", () => {
    render(
      <DropdownMenu
        label="Disabled menu"
        disabled
        trigger={() => <span>▼</span>}
      >
        {() => <DropdownItem>Edit</DropdownItem>}
      </DropdownMenu>,
    );
    fireEvent.click(screen.getByLabelText("Disabled menu"));
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });
});
