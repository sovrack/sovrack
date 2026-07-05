import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TerminalHub } from "./terminal-hub";
import { serversService } from "@/features/servers";

vi.mock("@/features/servers", () => ({
  serversService: { getAll: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/features/auth/api/use-auth", () => ({
  useAuth: () => ({ isAdmin: true, user: { role: "ADMIN" }, loading: false }),
}));

// LOT4f : première couverture de la feature terminal (était à ZÉRO test).
describe("TerminalHub", () => {
  it("loads the server list and renders the SSH terminal hub", async () => {
    vi.mocked(serversService.getAll).mockResolvedValue([] as never);
    render(<TerminalHub />);
    await waitFor(() => expect(serversService.getAll).toHaveBeenCalled());
    expect(screen.getAllByText(/Terminal SSH/).length).toBeGreaterThan(0);
  });
});
