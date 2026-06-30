import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServiceCiGenerator } from "./service-ci-generator";

vi.mock("@/features/source-providers", () => ({
  buildService: { prepare: vi.fn() },
}));
vi.mock("@/features/platform", () => ({
  webhooksService: { status: vi.fn() },
}));

import { buildService } from "@/features/source-providers";
import { webhooksService } from "@/features/platform";

describe("ServiceCiGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webhooksService.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      webhookUrl: "https://platform/hook/abc",
    });
  });

  it("uses the provider-correct CI filename from the backend (GitHub → .github/workflows)", async () => {
    (buildService.prepare as ReturnType<typeof vi.fn>).mockResolvedValue({
      ciConfigContent: "name: deploy",
      ciConfigFilePath: ".github/workflows/deploy.yml",
      dockerfileContent: "FROM node:20",
      dockerignoreContent: "node_modules",
    });

    render(<ServiceCiGenerator projectId="p1" serviceId="s1" />);
    fireEvent.click(screen.getByText("Generate"));

    // The CI file must NOT be hardcoded to .gitlab-ci.yml for a GitHub repo.
    await waitFor(() =>
      expect(
        screen.getByText(".github/workflows/deploy.yml"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Dockerfile").length).toBeGreaterThan(0);
    // How-to + the webhook URL are surfaced for the user.
    expect(screen.getByText(/Colle chaque fichier/)).toBeInTheDocument();
    expect(screen.getByText("https://platform/hook/abc")).toBeInTheDocument();
  });

  it("shows an error when generation fails", async () => {
    (buildService.prepare as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    render(<ServiceCiGenerator projectId="p1" serviceId="s1" />);
    fireEvent.click(screen.getByText("Generate"));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
  });
});
