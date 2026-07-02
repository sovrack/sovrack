import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddProviderDialog } from "./add-provider-dialog";
import type { GitlabProvider } from "@/features/platform";

const baseProps = {
  open: true,
  mode: "create" as const,
  fallbackRedirectUri: "https://app.example.com/oauth/callback",
  saving: false,
  error: null,
  copiedRedirect: false,
  onClose: vi.fn(),
  onCopyRedirectUri: vi.fn(),
};

/** Advances from step 1 (provider type) to step 2 (instance config). */
function goToStep2() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("AddProviderDialog — main flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AddProviderDialog {...baseProps} open={false} onSave={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on step 1 (provider type) with GitLab selected by default", () => {
    render(<AddProviderDialog {...baseProps} onSave={vi.fn()} />);
    expect(screen.getByText("Select Provider")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("selecting GitHub on step 1 carries through as the default instance URL on step 2", () => {
    render(<AddProviderDialog {...baseProps} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText("GitHub"));
    goToStep2();
    expect(screen.getByPlaceholderText("https://gitlab.com")).toHaveValue(
      "https://github.com",
    );
  });

  it("blocks proceeding past step 2 until name + URL are filled", () => {
    render(<AddProviderDialog {...baseProps} onSave={vi.fn()} />);
    goToStep2(); // step 1 -> 2 (GitLab preselected, always valid)
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("e.g. GitLab Cloud, Company GitLab"),
      { target: { value: "Company GitLab" } },
    );
    expect(
      screen.getByRole("button", { name: /continue/i }),
    ).not.toBeDisabled();
  });

  it("walks the full create flow and calls onSave with the built payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AddProviderDialog {...baseProps} onSave={onSave} />);

    // Step 1 -> 2
    goToStep2();

    // Step 2: instance config
    fireEvent.change(
      screen.getByPlaceholderText("e.g. GitLab Cloud, Company GitLab"),
      { target: { value: "Company GitLab" } },
    );
    fireEvent.change(screen.getByPlaceholderText("https://gitlab.com"), {
      target: { value: "https://gitlab.company.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3: auth method — default "both" is already valid, just continue
    expect(screen.getByText("Authentication Method")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 4: credentials — fill the PAT field then submit
    expect(screen.getByText("Personal Access Token")).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText("glpat-xxxxxxxxxxxxxxxxxxxx"),
      { target: { value: "glpat-secret" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /add provider/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [payload, providerType] = onSave.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(providerType).toBe("GITLAB");
    expect(payload).toMatchObject({
      name: "Company GitLab",
      providerUrl: "https://gitlab.company.com",
      adminToken: "glpat-secret",
    });
  });

  it("renders the error banner when the error prop is set", () => {
    render(
      <AddProviderDialog {...baseProps} error="Connection failed" onSave={vi.fn()} />,
    );
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("edit mode starts on step 2 and pre-fills the form from the existing provider", () => {
    const existing: GitlabProvider = {
      id: "gp1",
      name: "Existing GitLab",
      type: "GITLAB",
      providerUrl: "https://gitlab.example.com",
      internalUrl: "",
      redirectUri: "",
      applicationId: "app-id",
      applicationSecretConfigured: true,
      groupNames: "",
      adminTokenConfigured: true,
      oauthTokenConfigured: false,
      oauthExpiresAt: null,
      status: "CONFIGURED",
      isDefault: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    render(
      <AddProviderDialog
        {...baseProps}
        mode="edit"
        existingProvider={existing}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("Edit Git Provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing GitLab")).toBeInTheDocument();
  });

  it("closes via the close (X) button", () => {
    const onClose = vi.fn();
    render(<AddProviderDialog {...baseProps} onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
