import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
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
      webhookUrl: "https://deployautomation/hook/abc",
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
    expect(screen.getByText(/Paste each file/)).toBeInTheDocument();
    expect(screen.getByText("https://deployautomation/hook/abc")).toBeInTheDocument();
  });

  it("shows an error when generation fails", async () => {
    (buildService.prepare as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    render(<ServiceCiGenerator projectId="p1" serviceId="s1" />);
    fireEvent.click(screen.getByText("Generate"));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
  });

  // "Correction rapide" mission, Task 2.4: audited every "Copy" button in the
  // frontend (this one, settings/git's OAuth redirect copy, ssh-keys copy,
  // server-key-install copy) for a previously-identified "copy button doesn't
  // work" defect. Every implementation uses the same
  // `navigator.clipboard.writeText` + try/catch + timed reset pattern; no
  // structural defect was found here specifically. These tests empirically
  // confirm each Copy button writes ITS OWN file's exact content (not a stale
  // or wrong-file value) and shows the "Copied" confirmation only for the
  // clicked button.
  describe("Copy buttons (Task 2.4 audit)", () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });

    it("copies the exact content of the specific file clicked, not another file's", async () => {
      (buildService.prepare as ReturnType<typeof vi.fn>).mockResolvedValue({
        ciConfigContent: "stages:\n  - deploy",
        ciConfigFilePath: ".gitlab-ci.yml",
        dockerfileContent: "FROM node:20",
        dockerignoreContent: "node_modules\n.git",
      });

      render(<ServiceCiGenerator projectId="p1" serviceId="s1" />);
      fireEvent.click(screen.getByText("Generate"));
      await waitFor(() => screen.getByText(".dockerignore"));

      const findFileRow = (name: string) =>
        screen
          .getAllByText(name)
          .map((el) => el.closest(".overflow-hidden"))
          .find((el): el is HTMLElement => el !== null)!;

      fireEvent.click(
        within(findFileRow("Dockerfile")).getByRole("button", {
          name: /copy/i,
        }),
      );
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "FROM node:20",
        ),
      );

      fireEvent.click(
        within(findFileRow(".dockerignore")).getByRole("button", {
          name: /copy/i,
        }),
      );
      await waitFor(() =>
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "node_modules\n.git",
        ),
      );
    });

    it("shows 'Copied' only on the clicked file's own button", async () => {
      (buildService.prepare as ReturnType<typeof vi.fn>).mockResolvedValue({
        ciConfigContent: "stages:\n  - deploy",
        ciConfigFilePath: ".gitlab-ci.yml",
        dockerfileContent: "FROM node:20",
        dockerignoreContent: "node_modules",
      });

      render(<ServiceCiGenerator projectId="p1" serviceId="s1" />);
      fireEvent.click(screen.getByText("Generate"));
      await waitFor(() => screen.getByText(".dockerignore"));

      const findFileRow = (name: string) =>
        screen
          .getAllByText(name)
          .map((el) => el.closest(".overflow-hidden"))
          .find((el): el is HTMLElement => el !== null)!;

      const dockerfileRow = findFileRow("Dockerfile");
      fireEvent.click(
        within(dockerfileRow).getByRole("button", { name: /copy/i }),
      );

      await waitFor(() =>
        expect(within(dockerfileRow).getByText("Copied")).toBeInTheDocument(),
      );
      const dockerignoreRow = findFileRow(".dockerignore");
      expect(within(dockerignoreRow).getByText("Copy")).toBeInTheDocument();
    });
  });
});
