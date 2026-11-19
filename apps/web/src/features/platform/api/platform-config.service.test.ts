import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/shared/lib/api";
import { platformConfigService } from "./platform-config.service";

vi.mock("@/shared/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("platformConfigService workspace paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("sovrack-selected-workspace", "workspace 1");
    mockedApi.get.mockResolvedValue({ data: [] });
  });

  it("uses the explicit workspace route for Git integrations", async () => {
    await platformConfigService.listGitlabProviders();

    expect(mockedApi.get).toHaveBeenCalledWith(
      "/workspaces/workspace%201/integrations/git/gitlab/providers",
    );
  });

  it("uses the explicit workspace route for registries", async () => {
    await platformConfigService.listRegistryConfigs();

    expect(mockedApi.get).toHaveBeenCalledWith(
      "/workspaces/workspace%201/integrations/registries",
    );
  });

  it("fails locally before sending a request when no workspace is selected", async () => {
    localStorage.clear();

    await expect(
      platformConfigService.listGitlabProviders(),
    ).rejects.toThrow("Sélectionnez un workspace");
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});
