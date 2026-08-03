import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const registerMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("@/features/auth/api/use-auth", () => ({
  useAuth: () => ({ register: registerMock }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/register",
}));
vi.mock("@/shared/lib/api", () => ({
  getApiErrorMessage: (e: unknown) => (e as Error)?.message ?? "",
}));

import { RegisterScreen } from "./register-screen";

describe("RegisterScreen (public signup)", () => {
  beforeEach(() => {
    registerMock.mockReset();
    replaceMock.mockReset();
  });

  const fillAndSubmit = () => {
    fireEvent.change(screen.getByPlaceholderText("John Developer"), {
      target: { value: "John Dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("vous@entreprise.com"), {
      target: { value: "john@sovrack.tn" },
    });
    fireEvent.change(screen.getByPlaceholderText("Mon équipe"), {
      target: { value: "Équipe John" },
    });
    fireEvent.change(screen.getByPlaceholderText("8 caractères minimum"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));
  };

  it("submits account + team and redirects to /dashboard on success", async () => {
    registerMock.mockResolvedValue(undefined);
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        email: "john@sovrack.tn",
        password: "StrongPass123!",
        fullName: "John Dev",
        teamName: "Équipe John",
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error and stays on the page when signup fails", async () => {
    registerMock.mockRejectedValue(new Error("Email déjà utilisé"));
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Email déjà utilisé")).toBeInTheDocument(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
