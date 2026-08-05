import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserRow } from "./user-row";
import type { UserListItem } from "@/features/users/types/user";

// E8 : la feature users n'avait AUCUN test — on verrouille le rendu de la
// ligne (infos + badge d'état) et le câblage des callbacks d'action.
const user: UserListItem = {
  id: "u1",
  fullName: "Alice Martin",
  email: "alice@example.com",
  role: "MEMBER",
  isActive: true,
  createdAt: "2026-01-15T10:00:00.000Z",
} as UserListItem;

function renderRow(overrides: Partial<Parameters<typeof UserRow>[0]> = {}) {
  return render(
    <table>
      <tbody>
        <UserRow
          user={user}
          onToggleActive={vi.fn()}
          onDelete={vi.fn()}
          togglingId={null}
          deletingUserId={null}
          {...overrides}
        />
      </tbody>
    </table>,
  );
}

describe("UserRow", () => {
  it("renders the user identity, role and active badge", () => {
    renderRow();
    expect(screen.getByText("Alice Martin")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("MEMBER")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows Inactive for a deactivated user", () => {
    renderRow({ user: { ...user, isActive: false } });
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("wires the toggle and delete callbacks", () => {
    const onToggleActive = vi.fn();
    const onDelete = vi.fn();
    renderRow({ onToggleActive, onDelete });

    const buttons = screen.getAllByRole("button");
    // 1er bouton = toggle actif/inactif, dernier = suppression.
    fireEvent.click(buttons[0]);
    expect(onToggleActive).toHaveBeenCalledWith("u1");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onDelete).toHaveBeenCalledWith(user);
  });
});
