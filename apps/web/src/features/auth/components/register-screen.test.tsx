import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const registerMock = vi.fn();
const verifyEmailMock = vi.fn();
const resendCodeMock = vi.fn();
const replaceMock = vi.fn();

vi.mock("@/features/auth/api/use-auth", () => ({
  useAuth: () => ({
    register: registerMock,
    verifyEmail: verifyEmailMock,
    resendCode: resendCodeMock,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/register",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/shared/lib/api", () => ({
  getApiErrorMessage: (e: unknown) => (e as Error)?.message ?? "",
}));

import { RegisterScreen } from "./register-screen";

describe("RegisterScreen (public signup)", () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    registerMock.mockReset();
    verifyEmailMock.mockReset();
    resendCodeMock.mockReset();
    replaceMock.mockReset();
    assignMock.mockReset();
    vi.stubGlobal("location", {
      ...window.location,
      assign: assignMock,
    });
  });

  const fillAndSubmit = (organization = false) => {
    fireEvent.change(screen.getByPlaceholderText("John Developer"), {
      target: { value: "John Dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("vous@entreprise.com"), {
      target: { value: "john@sovrack.tn" },
    });
    if (organization) {
      fireEvent.click(screen.getByRole("radio", { name: /organisation/i }));
      fireEvent.change(screen.getByPlaceholderText("Acme Engineering"), {
        target: { value: "Équipe John" },
      });
    }
    fireEvent.change(screen.getByPlaceholderText("12 caractères minimum"), {
      target: { value: "StrongPass123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /créer mon compte/i }));
  };

  const enterCode = (code: string) => {
    const inputs = screen.getAllByLabelText(/Chiffre \d/).slice(0, code.length);
    code.split("").forEach((digit, index) => {
      fireEvent.change(inputs[index], { target: { value: digit } });
    });
    fireEvent.click(
      screen.getByRole("button", { name: /vérifier et accéder/i }),
    );
  };

  it("creates the account, then shows the code step instead of redirecting", async () => {
    registerMock.mockResolvedValue("registration-1");
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        email: "john@sovrack.tn",
        password: "StrongPass123!",
        fullName: "John Dev",
        workspaceType: "PERSONAL",
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Vérifiez votre email")).toBeInTheDocument(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("creates an organization only when that workspace type is selected", async () => {
    registerMock.mockResolvedValue("registration-1");
    render(<RegisterScreen />);
    fillAndSubmit(true);

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith({
        email: "john@sovrack.tn",
        password: "StrongPass123!",
        fullName: "John Dev",
        workspaceType: "ORGANIZATION",
        workspaceName: "Équipe John",
      }),
    );
  });

  it("verifies the code and redirects to /dashboard", async () => {
    registerMock.mockResolvedValue("registration-1");
    verifyEmailMock.mockResolvedValue(undefined);
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Vérifiez votre email")).toBeInTheDocument(),
    );
    enterCode("123456");

    await waitFor(() =>
      expect(verifyEmailMock).toHaveBeenCalledWith(
        "john@sovrack.tn",
        "123456",
        "registration-1",
      ),
    );
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error when the code is wrong", async () => {
    registerMock.mockResolvedValue("registration-1");
    verifyEmailMock.mockRejectedValue(
      new Error("Code de vérification invalide"),
    );
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Vérifiez votre email")).toBeInTheDocument(),
    );
    enterCode("000000");

    await waitFor(() =>
      expect(
        screen.getByText("Code de vérification invalide"),
      ).toBeInTheDocument(),
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("resends a code and confirms", async () => {
    registerMock.mockResolvedValue("registration-1");
    resendCodeMock.mockResolvedValue(undefined);
    render(<RegisterScreen />);
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Vérifiez votre email")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /renvoyer le code/i }));

    await waitFor(() =>
      expect(resendCodeMock).toHaveBeenCalledWith(
        "john@sovrack.tn",
        "registration-1",
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Un nouveau code a été envoyé par email."),
      ).toBeInTheDocument(),
    );
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
